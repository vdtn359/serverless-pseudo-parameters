'use strict';

class ServerlessAWSPseudoParameters {
	constructor(serverless, options) {
		this.serverless = serverless;
		this.options = options || {};
		this.hooks = {
			'after:aws:package:finalize:mergeCustomProviderResources': this.addParameters.bind(
				this
			),
			'before:offline:start:init': this.replaceParameters.bind(this),
		};
		this.skipRegionReplace = get(
			serverless.service,
			'custom.pseudoParameters.skipRegionReplace',
			true
		);
		this.allowReferences = get(
			serverless.service,
			'custom.pseudoParameters.allowReferences',
			true
		);
		this.colors = get(
			this.serverless,
			'processedInput.options.color',
			true
		);
		this.debug = this.options.debug || process.env.SLS_DEBUG;
		
		if (this.allowReferences) {
			this.aws_regex = /#{([^}]+)}/g;
		} else {
			this.aws_regex = /#{(AWS::[a-zA-Z]+)}/g;
		}
	}

	replaceParameters() {
		const skipRegionReplace = this.skipRegionReplace;
		const allowReferences = this.allowReferences;
		const colors = this.colors;
		const debug = this.debug;
		if (debug) consoleLog(yellow(underline('AWS Pseudo Parameters')));

		if (skipRegionReplace && debug) {
			consoleLog(
				'Skipping automatic replacement of regions with account region!'
			);
		}
		
		const region = this.serverless.service.provider.region;
		
		const keys = ['functions', 'custom', 'resources', 'provider'];

		Object.keys(this.serverless.service).forEach(identifier => {
			if (!keys.includes(identifier)) {
				return;
			}
			this.replaceChildNodes(this.serverless.service[identifier], identifier, (
				key,
				value,
			) => {
				return value.replace(this.aws_regex, (matched, p1) => {
					const map = {
						'AWS::Region': region,
						'AWS::AccountId': 123456789012,
					};
					return map[p1] || matched;
				});
			});
		});
	}

	addParameters() {
		const template = this.serverless.service.provider
			.compiledCloudFormationTemplate;
		const skipRegionReplace = this.skipRegionReplace;
		const allowReferences = this.allowReferences;
		const colors = this.colors;
		const debug = this.debug;
		const consoleLog = this.serverless.cli.consoleLog;

		if (debug) consoleLog(yellow(underline('AWS Pseudo Parameters')));

		if (skipRegionReplace && debug) {
			consoleLog(
				'Skipping automatic replacement of regions with account region!'
			);
		}

		// loop through the entire template, and check all (string) properties for any #{AWS::}
		// reference. If found, replace the value with an Fn::Sub reference
		Object.keys(template).forEach(identifier => {
			this.replaceChildNodes(template[identifier], identifier, (
				key,
				value,
			) => {
				let replacedString = value.replace(this.aws_regex, '${$1}');

				if (key === 'Fn::Sub') {
					return replacedString;
				} else {
					return {
						'Fn::Sub': replacedString,
					};
				}
			});
		});
	}

	replaceChildNodes(dictionary, name, processFunction) {
		Object.keys(dictionary).forEach(key => {
			let value = dictionary[key];
			// if a region name is mentioned, replace it with a reference (unless we are skipping automatic replacements)
			if (
				typeof value === 'string' &&
				!this.skipRegionReplace &&
				containsRegion(value)
			) {
				const regionFinder = new RegExp(regions().join('|'));
				value = value.replace(regionFinder, '#{AWS::Region}');
			}

			// we only want to possibly replace strings with an Fn::Sub
			if (typeof value === 'string' && value.search(this.aws_regex) >= 0) {
				dictionary[key] = processFunction(key, value);

				if (this.debug) {
					// do some fancy logging
					let m = this.aws_regex.exec(value);
					while (m) {
						consoleLog(
							'AWS Pseudo Parameter: ' +
							name +
							'::' +
							key +
							' Replaced ' +
							yellow(m[1]) +
							' with ' +
							yellow('${' + m[1] + '}')
						);
						m = this.aws_regex.exec(value);
					}
				}
			}

			// dicts and arrays need to be looped through
			if (isDict(value) || isArray(value)) {
				dictionary[key] = this.replaceChildNodes(
					value,
					name + '::' + key,
					processFunction
				);
			}
		});
		return dictionary;
	}
}

function isDict(v) {
	return (
		typeof v === 'object' &&
		v !== null &&
		!(v instanceof Array) &&
		!(v instanceof Date)
	);
}

function isArray(v) {
	return Object.prototype.toString.call(v) === '[object Array]';
}

function regions() {
	return [
		'ap-northeast-1',
		'ap-northeast-2',
		'ap-south-1',
		'ap-southeast-1',
		'ap-southeast-2',
		'ca-central-1',
		'eu-central-1',
		'eu-west-1',
		'eu-west-2',
		'eu-west-3',
		'sa-east-1',
		'us-east-1',
		'us-east-2',
		'us-west-1',
		'us-west-2',
	];
}

function containsRegion(v) {
	return new RegExp(regions().join('|')).test(v);
}

function get(obj, path, def) {
	return path
		.split('.')
		.filter(Boolean)
		.every(step => !(step && (obj = obj[step]) === undefined))
		? obj
		: def;
}

function yellow(str) {
	if (colors) return '\u001B[33m' + str + '\u001B[39m';
	return str;
}

function underline(str) {
	if (colors) return '\u001B[4m' + str + '\u001B[24m';
	return str;
}

module.exports = ServerlessAWSPseudoParameters;
