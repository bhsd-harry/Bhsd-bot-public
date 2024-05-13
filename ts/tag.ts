/**
 * @Function: 检查[[Category:使用无效自封闭HTML标签的页面]]并修复
 */
'use strict';

import Parser from 'wikiparser-node';
import Api = require('../lib/api');
import {error, runMode} from '../lib/dev';
const {user, pin, url} = require('../config/user');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode('user');
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复无效自封闭的HTML标签');
			return;
		}
	}
	const pages = await api.categorymembers(
			'使用无效自封闭HTML标签的页面',
			mode === 'user' ? {gcmnamespace: 2} : undefined,
		),
		{html: [tags]} = Parser.getConfig();
	const list = pages.map(({pageid, ns, content, timestamp, curtimestamp}) => {
		const root = Parser.parse(content, ns === 10, 3),
			tokens = root.querySelectorAll<Parser.HtmlToken>('html[selfClosing=true]').filter(({name}) => tags.includes(name));
		if (tokens.length === 0) {
			error(`页面 ${pageid} 未找到无效自封闭的HTML标签！`);
			return null;
		}
		for (const token of tokens) {
			try {
				token.fix();
			} catch {}
		}
		const text = root.toString();
		return text !== content && [pageid, content, text, timestamp, curtimestamp];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复无效自封闭的HTML标签');
};

if (!module.parent) {
	main();
}

module.exports = main;
