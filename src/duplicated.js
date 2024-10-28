/** @file 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复 */
'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{error, runMode} = require('../lib/dev'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const ignorePages = [];

const analyze = (wikitext, pageid, ns) => {
	let root = Parser.parse(wikitext, ns === 10, 2);
	const comments = root.querySelectorAll('[duplication]:is(template, magic-word#invoke) comment[closed]')
		.filter(({firstChild: {data}}) => data.includes('<!--'));
	for (const comment of comments) {
		comment.replaceWith(`${String(comment.firstChild)}-->`);
		const {previousSibling} = comment;
		if (previousSibling?.data?.endsWith(' • ')) {
			previousSibling.deleteData(-3, 3);
		}
	}
	root = Parser.parse(String(root), ns === 10, 2);
	let found = false;
	const templates = root.querySelectorAll('template,magic-word#invoke');
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
				if (/^in(?:\d+年)?(?:\d+月)?(?:\d+日)?$/u.test(key)) {
					let i = 2;
					const attempt = arg => {
						try {
							arg.rename(`${key}#${i}`);
						} catch {
							i++;
							attempt(arg);
						}
					};
					for (const arg of [...token.getArgs(key)].slice(1)) {
						attempt(arg);
						i++;
					}
					keys.delete(key);
				}
			}
		}
		for (const key of keys) {
			error(`页面 ${pageid} 中模板 ${token.name} 的重复参数 ${key.replaceAll('\n', String.raw`\n`)} 均非空！`);
		}
	}
	for (const token of templates.filter(({name}) => /^Template:彩虹社信息[栏欄]$/u.test(name))) {
		found = true;
		for (const key of [
			'本名',
			'昵称',
			'发色',
			'瞳色',
			'身高',
			'体重',
			'年龄',
			'生日',
			'星座',
			'血型',
			'种族',
			'出身地区',
			'语言',
			'萌点',
			'个人状态',
		]) {
			token.getArg(`基本信息-${key}`)?.rename(key);
		}
		for (const key of ['形象设计', '同期']) {
			token.getArg(`相关人士_${key}`)?.rename(key);
			token.getArg(`相关人士-${key}`)?.rename(key);
		}
	}
	const text = String(root);
	return [text, found];
};

const main = async (api = new Api(user, pin, url), templateOnly = true) => {
	const mode = runMode('user');
	if (templateOnly && !module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复重复的模板参数');
			return;
		}
	}
	let pages;
	if (templateOnly) {
		// 先只检查模板，防止大量嵌入
		pages = await api.categorymembers('调用重复模板参数的页面', {gcmnamespace: mode === 'user' ? 2 : 10});
		templateOnly &&= pages.length > 0;
	}
	if (!templateOnly && mode !== 'user') {
		pages = (await api.categorymembers('调用重复模板参数的页面', {gcmnamespace: '0|1|3|9|11|12|13|14|15|275|829'}))
			.filter(({pageid}) => !ignorePages.includes(pageid));
	}
	const list = pages.map(({pageid, ns, content, title, timestamp, curtimestamp}) => {
		const [text, found] = analyze(content, pageid, ns);
		if (text === content) {
			if (!found) {
				error(`页面 ${pageid} ${title.replaceAll(' ', '_')} 找不到重复的模板参数！`);
				return [pageid, null, null, timestamp, curtimestamp];
			}
			return null;
		}
		return [pageid, content, text, timestamp, curtimestamp];
	}).filter(Boolean);
	await api.massEdit(list, mode, '自动修复重复的模板参数');
	if (templateOnly && mode === 'run') {
		main(api, false);
	}
};

if (!module.parent) {
	main();
}

module.exports = main;
