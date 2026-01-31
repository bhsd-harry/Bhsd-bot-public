/** @file 检查[[Category:使用无效自封闭HTML标签的页面]]并修复 */
'use strict';
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	Api = require('../lib/api'),
	{error, runMode} = require('../lib/dev'),
	Parser = require('wikiparser-node');
Object.assign(Parser, {
	warning: false,
	config: './config/moegirl',
	internal: true,
});

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message}) => message === '无效自封闭标签',
	)).slice(0, 300);
	const mode = runMode();
	if (targets.length === 0 && mode !== 'redry') {
		return;
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复无效自封闭的HTML标签');
		return;
	}
	const pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)}),
		[tags] = Parser.getConfig().html;
	const list = pages.map(({pageid, ns, title, content, timestamp, curtimestamp}) => {
		const root = Parser.parse(content, title, ns === 10, 3),
			tokens = root.querySelectorAll('html[selfClosing]').filter(({name}) => tags.includes(name));
		if (tokens.length === 0) {
			error(`页面 ${pageid} 未找到无效自封闭的HTML标签！`);
			return null;
		}
		for (const token of tokens) {
			try {
				token.fix();
			} catch {}
		}
		const text = String(root);
		return text !== content && [pageid, content, text, timestamp, curtimestamp];
	}).filter(Boolean);
	await api.massEdit(list, mode, '自动修复无效自封闭的HTML标签');
};

if (!module.parent) {
	main();
}

module.exports = main;
