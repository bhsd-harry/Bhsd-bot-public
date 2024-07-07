'use strict';

const damerauLevenshtein = require('talisman/metrics/damerau-levenshtein'),
	Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	const regex = /^重复的图片[a-z]+参数$/u,
		targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
			({message}) => message === '无效的图库图片参数' || regex.test(message),
		));
	if (targets.length === 0) {
		return;
	}
	const mode = runMode();
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除重复的图片参数');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)}),
		width = new RegExp(
			String.raw`^\d*(?:x\d*)?(?:${
				Object.entries(Parser.getConfig().img).filter(([, key]) => key === 'width')
					.map(([syntax]) => syntax.slice(2))
					.join('|')
			})$`,
			'u',
		);
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 6),
			keys = [
				'invalid',
				...new Set(
					lintErrors[pageid].errors.filter(({message}) => regex.test(message))
						.map(({message}) => message.slice(5, -2)),
				),
			],
			selector = keys.map(key => `image-parameter#${key}`).join(),
			/** @type {[string, string[]][]} */ mistakes = [
				['thumbnail', ['thumbnail', 'thumb', '缩略图', '縮圖']],
				['right', ['right', '右']],
				['center', ['center', 'centre', '居中', '置中']],
				['none', ['none', '无', '無']],
				['left', ['left', '左']],
				['framed', ['framed', 'enframed', 'frame', '有框']],
			];
		for (const parameter of root.querySelectorAll(selector)) {
			if (!root.contains(parameter)) {
				continue;
			}
			const {parentNode: {childNodes, type}, name: curName, value: curValue} = parameter,
				i = childNodes.indexOf(parameter),
				repeated = childNodes.slice(i + 1).filter(({name}) => name === curName);
			if (curName === 'invalid') {
				parameter.remove();
				continue;
			} else if (repeated.length === 0) {
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
			const lcValue = curValue.toLowerCase(),
				key = mistakes.find(
					([, candidates]) => candidates.some(candidate => damerauLevenshtein(candidate, lcValue) <= 1),
				)?.[0];
			if (key) {
				if (type === 'gallery-image' || childNodes.some(({name}) => name === key)) {
					parameter.remove();
				} else {
					parameter.setText(key);
				}
				continue;
			}
			const mt = /^(?:(\d+)\s*(?:[*×x]\s*(\d+))?(?:p[px]|xp)+|(?:px|宽度)=(x?\d+)(?:px)?)$/iu.exec(curValue.trim());
			if (mt) {
				if (type === 'gallery-image') {
					parameter.remove();
				} else if (!childNodes.some(({name}) => name === 'width')) {
					if (mt[1]) {
						parameter.setText(`${mt[1]}x${mt[2]}px`);
					} else {
						parameter.setText(`${mt[3]}px`.toLowerCase());
					}
				}
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动移除重复的图片参数');
};

if (!module.parent) {
	main();
}

module.exports = main;
