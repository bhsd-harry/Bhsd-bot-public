/**
 * @Function: 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复
 */
'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{error, runMode, parse} = require('../lib/dev');

const ignorePages = [];

const _empty = value => !value.toString().replace(/\s*<!--.*?-->\s*/g, ''); // 除注释外有非空字符的参数值才是非空的

// 以下函数只会修改index_of属性，其他属性可暂时忽略
const _splice = (token, i) => {
	if (typeof token[i].key === 'number') { // 至多发生一次
		token.filter(({key}) => typeof key === 'number').forEach(arg => {
			arg.key = String(arg.key);
			arg[0] = arg.key;
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
	const parsed = parse(wikitext);
	const found = {};
	parsed.each(type => ['transclusion', 'magic_word_function'].includes(type), token => {
		if (token.ignored.length === 0) {
			return;
		}
		token.ignored.sort((a, b) => b - a).forEach(i => { // 倒序排列，以保证序号不会因_splice()变更
			const {key, 2: ignored_value} = token[i],
				j = token.index_of[key],
				[,, effective_value] = token[j];
			if (_empty(ignored_value)
				|| !/\D\d+$/.test(key) && ignored_value.toString() === effective_value.toString()) {
				// 修复情形1：忽略空参数或重复参数
				_splice(token, i);
			} else if (_empty(effective_value)) {
				// 修复情形2：有效值被空参数覆盖；注意这种情形至多发生一次
				_splice(token, j);
				token.index_of[key] = i;
			} else if (token.page_title === 'Template:Timeline' && /^in(?:\d+年)?(?:\d+月)?(?:\d+日)?$/.test(key)) {
				// 修复情形3：{{Timeline}}
				token[j][0] += '#2';
			} else if (!(key in found)) {
				error(`页面 ${pageid} 中重复的模板参数 ${key.toString().replaceAll('\n', '\\n')} 均非空，无法简单修复！`);
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
	// 先只检查模板，防止大量嵌入
	let pages = await api.categorymembers('调用重复模板参数的页面', {gcmnamespace: 10});
	if (pages.length === 0) {
		pages = (await api.categorymembers('调用重复模板参数的页面'))
			.filter(({pageid}) => !ignorePages.includes(pageid));
	}
	const list = pages.map(({pageid, content, title, timestamp, curtimestamp}) => {
		const [text, found] = _analyze(content, pageid);
		if (text === content) {
			if (Object.keys(found).length === 0) {
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
