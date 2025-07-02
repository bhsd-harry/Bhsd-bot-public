'use strict';

const config = require('@bhsd/code-standard/eslintrc.node.cjs');
const {plugins, rules, overrides, settings} = config,
	[json] = overrides;

for (const key in rules) {
	if (key.startsWith('jsdoc/')) {
		delete rules[key];
	}
}

module.exports = {
	...config,
	plugins: plugins.filter(plugin => plugin !== 'jsdoc'),
	ignorePatterns: ['old/'],
	rules: {
		...rules,
		camelcase: [
			2,
			{
				allow: ['surface_form'],
			},
		],
		'no-param-reassign': 0,
		'no-shadow': [
			2,
			{
				builtinGlobals: false,
			},
		],
		'unicorn/prefer-math-min-max': 0,
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
		...settings,
		n: {
			...settings.n,
			allowModules: ['request'],
		},
	},
};
