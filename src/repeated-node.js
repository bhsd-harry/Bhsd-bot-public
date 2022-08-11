/**
 * @Function: 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复
 */
'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{error, runMode} = require('../lib/dev'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const ignorePages = [];

const _analyze = (wikitext, pageid, ns) => {
	let root = Parser.parse(wikitext, ns === 10, 2);
	const comments = root.querySelectorAll('comment[closed=true]')
		.filter(({firstChild}) => firstChild.includes('<!--'));
	for (const comment of comments) {
		comment.replaceWith(`${comment.firstChild}-->`);
	}
	root = Parser.parse(root.toString(), ns === 10, 2);
	let found = false;
	const templates = root.querySelectorAll('template, magic-word#invoke');
	for (let token of templates) {
		if (!token.hasDuplicatedArgs()) {
			continue;
		}
		found = true;
		try {
			token = token.escapeTables();
		} catch {
			error(`页面 ${pageid} 中模板 ${token.name} 疑似包含未转义的表格语法！`);
			continue;
		}
		if (!token.hasDuplicatedArgs()) {
			continue;
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

const main = async (api = new Api(user, pin, url), templateOnly = true) => {
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
	templateOnly &&= pages.length > 0; // eslint-disable-line no-param-reassign
	if (!templateOnly) {
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
	}).filter(page => page && !(templateOnly && page[1] === page[2]));
	await api.massEdit(list, mode, '自动修复重复的模板参数');
	if (templateOnly) {
		main(api, false);
	}
};

if (!module.parent) {
	main();
}

module.exports = main;
