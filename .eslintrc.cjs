/* eslint @stylistic/array-bracket-newline: [2, {minItems: 1}] */
'use strict';

const config = require('@bhsd/common/eslintrc.node.cjs');
const {rules, overrides} = config,
	[
		json,
	] = overrides;

for (const key in rules) {
	if (key.startsWith('jsdoc/')) {
		delete rules[key];
	}
}

module.exports = {
	...config,
	plugins: config.plugins.slice(0, -1),
	ignorePatterns: [
		'old',
	],
	rules: {
		...rules,
		camelcase: [
			2,
			{
				allow: [
					'surface_form',
				],
			},
		],
		'no-param-reassign': 0,
		'no-shadow': [
			2,
			{
				builtinGlobals: false,
			},
		],
	},
	overrides: [
		{
			...json,
			rules: {
				...json.rules,
				'no-irregular-whitespace': 0,
				'@stylistic/eol-last': 0,
				'unicorn/numeric-separators-style': 0,
			},
		},
	],
	settings: {
		n: {
			...config.settings.n,
			allowModules: [
				'request',
			],
		},
	},
};
