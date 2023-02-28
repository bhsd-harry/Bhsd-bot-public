'use strict';

const Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除重复的图片参数');
		return;
	}
	const regex = /^重复的图片[a-z]+参数$/u,
		targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(({message}) => regex.test(message))),
		edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)}),
		width = new RegExp(
			`^\\d*(?:x\\d*)?(?:${
				Object.entries(Parser.getConfig().img).filter(([, key]) => key === 'width').map(([syntax]) => syntax.slice(2))
					.join('|')
			})$`,
			'u',
		);
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 6),
			keys = [...new Set(
				lintErrors[pageid].errors.filter(({message}) => regex.test(message)).map(({message}) => message.slice(5, -2)),
			)],
			selector = keys.map(key => `image-parameter#${key}`).join(),
			mistakes = [
				['thumbnail', new Set(['缩略图thumb', '略缩图', 'tumb', 'thumn', 'thump'])],
				['right', new Set(['rihgt', '居右', '右侧对齐', 'ringht', 'righ', 'Right', '靠右', 'reght', 'rigt', 'right]', 'righft', 'risht', 'rigft'])],
				['center', new Set(['中'])],
				['none', new Set(['none]', 'no'])],
				['left', new Set(['left]', 'Left'])],
				['framed', new Set(['Frame'])],
			];
		for (const parameter of root.querySelectorAll(selector)) {
			if (!root.contains(parameter)) {
				continue;
			}
			const {parentNode: {childNodes, type}, name: curName, value: curValue} = parameter,
				i = childNodes.indexOf(parameter),
				repeated = childNodes.slice(i + 1).filter(({name}) => name === curName);
			if (repeated.length === 0) {
				continue;
			} else if (repeated.some(({value}) => value === curValue)) {
				parameter.remove();
				continue;
			} else if (curName === 'width' && repeated.length === 1) {
				const [{value}] = repeated;
				if (curValue.startsWith('x') && !value.startsWith('x')) {
					parameter.setText(`${value}${curValue}`);
					repeated[0].remove();
				} else if (!curValue.startsWith('x') && value.startsWith('x')) {
					parameter.setText(`${curValue}${value}`);
					repeated[0].remove();
				}
				continue;
			} else if (curName !== 'caption') {
				continue;
			} else if (width.test(curValue) || curValue === 'default') {
				parameter.remove();
				continue;
			} else if (!repeated.at(-1).value) {
				repeated.at(-1).remove();
				continue;
			} else if (/^\s*link=/iu.test(curValue)) {
				if (childNodes.some(({name}) => name === 'link')) {
					parameter.remove();
				} else {
					parameter.setText(curValue.replace(/^\s*link=/iu, 'link='));
				}
				continue;
			}
			const key = mistakes.find(([, candidates]) => candidates.has(curValue))?.[0];
			if (key) {
				if (childNodes.some(({name}) => name === key)) {
					parameter.remove();
				} else {
					parameter.setText(key);
				}
				continue;
			}
			const mt = /^(?:(\d*)\s*(?:[*×]\s*(\d*))?px|(?:px|宽度)=(x?\d+)(?:px)?|(x?\d+)(?:pp|(?:px){2,}|xppx))$/iu
				.exec(curValue.trim());
			if (mt) {
				if (type === 'gallery-image') {
					parameter.remove();
				} else if (!childNodes.some(({name}) => name === 'width')) {
					if (mt[1]) {
						parameter.setText(`${mt[1]}x${mt[2]}px`);
					} else {
						parameter.setText(`${mt[3] ?? mt[4]}px`.toLowerCase());
					}
				}
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, String(root), timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动移除重复的图片参数');
};

if (!module.parent) {
	main();
}

module.exports = main;
