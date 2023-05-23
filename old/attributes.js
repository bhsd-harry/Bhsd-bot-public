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
			// await api.massEdit(null, mode, `自动移除无效的flashmp3属性 id`);
			return;
		}
	}
	const pages = (await Promise.all(
		new Array(9).fill().map((_, i) => api.search(`insource:"cellspacing=${i + 1}"`)),
		// [api.search(`insource:"flashmp3 id"`)],
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
				if (value && value !== true && (key !== 'cellspacing' || value !== '0')) {
					if (prop) {
						if (key === 'cellspacing' && /\bborder-collapse\s*:\s*separate\b/.test(style)) {
							style = `border-spacing:${value}${isNaN(value) ? '' : 'px'};${style}`; // 必须加在开头
						} else if (key !== 'cellspacing' || !/\bborder-collapse\s*:\s*collapse\b/.test(style)) {
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
		// for (const token of parsed.querySelectorAll('ext-attrs#flashmp3 > ext-attr#id')) {
		// 	token.remove();
		// }
		return [pageid, content, parsed.toString(), timestamp, curtimestamp];
	}))).filter(([, content, text]) => content !== text);
	await api.massEdit(edits, mode, `自动替换废弃的HTML属性 ${Object.keys(dict).join('、')}`);
	// await api.massEdit(edits, mode, `自动移除无效的flashmp3属性 id`);
};

if (!module.parent) {
	main();
}

module.exports = main;
