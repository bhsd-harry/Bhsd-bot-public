/**
 * @Function: 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复
 */
'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{error, runMode} = require('../lib/dev'),
	Parser = require('../../wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const ignorePages = [];

const _analyze = (wikitext, pageid, ns) => {
	let found = false;
	const root = Parser.parse(wikitext, ns === 10, 2),
		templates = root.querySelectorAll('template, magic-word#invoke');
	for (const token of templates) {
		if (/\n\s*{\|.+\n\|}[^}]/s.test(token.text())) {
			error(`页面 ${pageid} 中模板 ${token.name} 疑似包含未转义的表格语法！`);
			found = true;
			continue;
		} else if (token.getDuplicatedArgs().length > 0) {
			found = true;
		}
		const keys = new Set(token.fixDuplication(true));
		if (keys.size === 0) {
			continue;
		} else if (token.name === 'Template:Timeline') {
			for (const key of keys) {
				if (/^in(?:\d+年)?(?:\d+月)?(?:\d+日)?$/.test(key)) {
					let i = 2;
					const attempt = arg => {
						try {
							arg.rename(`${key}#${i}`);
						} catch {
							i++;
							attempt(arg);
						}
					};
					[...token.getArgs(key)].slice(1).forEach(arg => {
						attempt(arg);
						i++;
					});
					keys.delete(key);
				}
			}
		}
		for (const key of keys) {
			error(`页面 ${pageid} 中模板 ${token.name} 的重复参数 ${key.replaceAll('\n', '\\n')} 均非空！`);
		}
	}
	const text = root.toString();
	return [text, found];
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
	let pages = await api.categorymembers('调用重复模板参数的页面');
	if (pages.length === 0) {
		pages = (await api.categorymembers('调用重复模板参数的页面'))
			.filter(({pageid}) => !ignorePages.includes(pageid));
	}
	const list = pages.map(({pageid, ns, content, title, timestamp, curtimestamp}) => {
		const [text, found] = _analyze(content, pageid, ns);
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
