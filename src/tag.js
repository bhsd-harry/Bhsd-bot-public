/**
 * @Function: 检查[[Category:使用无效自封闭HTML标签的页面]]并修复
 */
'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{error, runMode} = require('../lib/dev'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复无效自封闭的HTML标签');
			return;
		}
	}
	const pages = await api.categorymembers('使用无效自封闭HTML标签的页面'),
		{html: [tags]} = Parser.getConfig();
	const list = pages.map(({pageid, ns, content, timestamp, curtimestamp}) => {
		const root = Parser.parse(content, ns === 10, 3),
			tokens = root.querySelectorAll('html[selfClosing=true]').filter(({name}) => tags.includes(name));
		if (tokens.length === 0) {
			error(`页面 ${pageid} 未找到无效自封闭的HTML标签！`);
			return null;
		}
		for (const token of tokens) {
			try {
				token.fix();
			} catch {}
		}
		return [pageid, content, root.toString(), timestamp, curtimestamp];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复无效自封闭的HTML标签');
};

if (!module.parent) {
	main();
}

module.exports = main;
