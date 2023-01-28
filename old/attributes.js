'use strict';
const {runMode, error} = require('../lib/dev'),
	Parser = require('wikiparser-node'),
	Api = require('../lib/api'),
	{user, pin, url} = require('../config/user');
Parser.warning = false;
Parser.config = './config/moegirl';

const dict = {
	cellspacing: 'border-collapse:separate;border-spacing',
};

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, `自动替换废弃的HTML属性 ${Object.keys(dict).join('、')}`);
			return;
		}
	}
	const pages = (await Promise.all(
		new Array(9).fill().map((_, i) => api.search(`insource:"cellspacing=${i + 1}"`)),
	)).flat();
	const edits = (await Promise.all(pages.map(({content, pageid, ns, timestamp, curtimestamp}) => {
		const parsed = Parser.parse(content, ns === 10, 4);
		let warned = false;
		for (const token of parsed.querySelectorAll('html-attrs[cellspacing], table-attrs[cellspacing]')) {
			if (token.querySelector('arg, template, magic-word')) {
				if (!warned) {
					error(`页面 ${pageid} 中出现了复杂HTML属性，请人工检查！`);
					warned = true;
				}
			}
			let style = token.getAttr('style') ?? '',
				modified = false;
			for (const [key, prop] of Object.entries(dict)) {
				const value = token.getAttr(key);
				if (value && value !== true
					&& (key !== 'cellspacing' || value !== '0' && !/\bborder-collapse\s*:\s*separate\b/.test(style))
				) {
					if (prop) {
						if (key !== 'cellspacing' || !/\border-collapse\s*:\s*collapse\b/.test(style)) {
							style = `${prop}:${value}${isNaN(value) ? '' : 'px'};${style}`; // 必须加在开头
						}
						token.removeAttr(key);
						modified = true;
					} else {
						error(`页面 ${pageid} 使用了 ${key} 属性，不便于修改为内联样式！`);
					}
				}
			}
			if (modified) {
				token.setAttr('style', style);
			}
		}
		return [pageid, content, parsed.toString(), timestamp, curtimestamp];
	}))).filter(([, content, text]) => content !== text);
	await api.massEdit(edits, mode, `自动替换废弃的HTML属性 ${Object.keys(dict).join('、')}`);
};

if (!module.parent) {
	main();
}

module.exports = main;
