/**
 * @Function: 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复
 */
/* global CeL */
'use strict';
const {user, pin, url} = require('../config/user.json'),
	Api = require('../lib/api.js'),
	{error, runMode} = require('../lib/dev.js');

require('../../CeJS/CeJS-master/_for include/node.loader.js');
CeL.run('application.net.wiki.parser');

const ignorePages = [];

const _splice = (token, i) => {
	if (typeof token[i].key === 'number') {
		token.filter(({key}) => typeof key === 'number').forEach(arg => {
			arg[0] = String(arg.key);
			arg[1] = '=';
		});
	}
	token.splice(i, 1);
	for (const key in token.index_of) {
		if (token.index_of[key] > i) {
			token.index_of[key]--;
		}
	}
};

const _analyze = (wikitext, pageid) => {
	const parsed = CeL.wiki.parser(wikitext);
	const found = {};
	parsed.each('transclusion', token => {
		if (!token.ignored || token.ignored.length === 0) {
			return;
		}
		token.ignored.sort((a, b) => b - a).forEach(i => {
			const {key, 2: ignored_value} = token[i],
				j = token.index_of[key],
				[,, effective_value] = token[j];
			if (!ignored_value || ignored_value === effective_value) { // 修复情形1：空参数或重复参数
				_splice(token, i);
			} else if (!effective_value) { // 修复情形1：空参数
				_splice(token, j);
				token.index_of[key] = i;
			} else if (token.page_title === 'Template:Timeline' && /^in(?:\d+年)?(?:\d+月)?(?:\d+日)?$/.test(key)) {
				// 修复情形2：{{Timeline}}
				token[j][0] += '#2';
			} else if (!(key in found)) {
				error(`页面 ${pageid} 中重复的模板参数 ${key} 均非空，无法简单修复！`);
				found[key] = true;
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
	const pages = (await api.categorymembers('调用重复模板参数的页面'))
		.filter(({pageid}) => !ignorePages.includes(pageid));
	const list = pages.map(({pageid, content}) => {
		if (/{{[\s\u200e]*(?:[Ii]nuse|施工中|[编編][辑輯]中)/.test(content)) {
			error(`已跳过施工中的页面 ${pageid} ！`);
			return null;
		}
		const [text, found] = _analyze(content, pageid);
		if (text === content) {
			if (Object.keys(found).length === 0) {
				error(`页面 ${pageid} 找不到重复的模板参数！`);
			}
			return null;
		}
		return [pageid, content, text];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复重复的模板参数');
};

if (!module.parent) {
	main();
}

module.exports = main;
