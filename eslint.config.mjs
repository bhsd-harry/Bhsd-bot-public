import {node, extend} from '@bhsd/code-standard';

export default extend(
	...node,
	{
		ignores: ['old/'],
	},
	{
		rules: {
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
	},
	{
		files: ['**/*.json'],
		rules: {
			'no-irregular-whitespace': 0,
			'@stylistic/eol-last': 0,
		},
	},
);
