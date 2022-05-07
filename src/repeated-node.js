/**
 * @Function: 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复
 */
'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{error, runMode} = require('../lib/dev'),
	Parser = require('../../parser-node/token'),
	{parse} = Parser;
Parser.warning = false;

const ignorePages = [];

const _analyze = (wikitext, pageid) => {
	const parsed = parse(wikitext, 2);
	let found = false;
	parsed.each('template, magic-word#invoke', token => {
		const keys = new Set(token.slice(1).map(({name}) => name));
		if (keys.size === token.length - 1) {
			return;
		}
		found = true;
		keys.forEach(key => {
			let args = token.getArgs(key),
				{length} = args;
			if (length === 1) {
				return;
			}
			let iAnon;
			const values = {};
			args.forEach((arg, i) => {
				const val = arg.getValue();
				if (val) {
					if (!(val in values)) {
						values[val] = i;
						if (iAnon !== undefined) {
							token.naming();
							args[iAnon].remove(); // 修复情形1：忽略空参数
							length--;
						}
					} else if (!arg.anon) {
						arg.remove(); // 修复情形2：忽略重复参数
						length--;
					} else {
						args[values[val]].remove(); // 修复情形2：忽略重复参数
						length--;
					}
				} else if (iAnon !== undefined || values.length || !arg.anon && i < args.length - 1) {
					arg.remove(); // 修复情形1：忽略空参数
					length--;
				} else {
					iAnon = i;
				}
			});
			if (length === 1) {
				return;
			} else if (length < args.length) {
				args = token.getArgs(key);
			}
			if (token.name === 'Template:Timeline' && /^in(?:\d+年)?(?:\d+月)?(?:\d+日)?$/.test(key)) {
				args.slice(1).forEach((arg, i) => {
					arg[0].update(`${key}#${i + 2}`); // 修复情形3：{{Timeline}}
				});
			} else {
				error(`页面 ${pageid} 中重复的模板参数 ${key.toString().replaceAll('\n', '\\n')} 均非空，无法简单修复！`);
			}
		});
	});
	return [parsed.toString(), found];
};

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复重复的模板参数');
			return;
		}
	}
	// 先只检查模板，防止大量嵌入
	let pages = await api.categorymembers('调用重复模板参数的页面', {gcmnamespace: 10});
	if (pages.length === 0) {
		pages = (await api.categorymembers('调用重复模板参数的页面'))
			.filter(({pageid}) => !ignorePages.includes(pageid));
	}
	const list = pages.map(({pageid, content, title, timestamp, curtimestamp}) => {
		const [text, found] = _analyze(content, pageid);
		if (text === content) {
			if (!found) {
				error(`页面 ${pageid} ${title.replaceAll(' ', '_')} 找不到重复的模板参数！`);
				return [pageid, null, null, timestamp, curtimestamp];
			}
			return null;
		}
		return [pageid, content, text, timestamp, curtimestamp];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复重复的模板参数');
};

if (!module.parent) {
	main();
}

module.exports = main;
