/**
 * @Function: 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复
 */
'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{error, runMode, info, escapeRegExp} = require('../lib/dev'),
	Parser = require('../../parser-node/token');
Parser.warning = false;

const ignorePages = [];

const _analyze = (wikitext, pageid) => {
	let found = false;
	const text = Parser.parse(wikitext, 2).each('template, magic-word#invoke', token => {
		if (/\n\s*{\|.+\n\|}[^}]/s.test(token.toString())) {
			error(`页面 ${pageid} 中模板 ${token.name} 疑似包含未转义的表格语法！`);
			found = true;
			return;
		}
		const keys = token.getKeys();
		if (keys.size === token.$children.length - 1) {
			return;
		}
		found = true;
		const numbered = [];
		keys.forEach(key => {
			let args = token.getArgs(key),
				{length} = args;
			if (length === 1) {
				return;
			}
			let iAnon;
			const values = new Map();
			args.forEach((arg, i) => {
				const val = arg.getValue().trim(); // 只有空白字符的参数一般相当于空参数
				if (val) {
					if (!values.has(val)) {
						values.set(val, i);
						if (iAnon !== undefined) {
							token.naming();
							args[iAnon].remove(); // 修复情形1：忽略空参数
							length--;
						}
					} else if (!arg.anon) {
						arg.remove(); // 修复情形2：忽略重复参数
						length--;
					} else {
						args[values.get(val)].remove(); // 修复情形2：忽略重复参数
						length--;
					}
				} else if (iAnon !== undefined || values.size || !arg.anon && i < args.length - 1) {
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
				let i = 2;
				const attempt = arg => {
					try {
						arg.rename(`${key}#${i}`); // 修复情形3：{{Timeline}}
					} catch {
						i++;
						attempt(arg);
					}
				};
				args.slice(1).forEach(arg => {
					attempt(arg);
					i++;
				});
			} else if (/\D\d+$/.test(key) || Number.isInteger(Number(key)) && token.getAnonArgs().length === 0) {
				const str = key.slice(0, -key.match(/\d+$/)[0].length),
					regex = new RegExp(`^${escapeRegExp(str)}\\d+$`),
					series = token.$children.slice(1).filter(({name}) => regex.test(name));
				let last;
				const ordered = series.every(({name}, i) => {
					const j = Number(name.slice(str.length)),
						cmp = j <= i + 1 && (i === 0 || j >= last || name === key);
					last = j;
					return cmp;
				});
				if (ordered) { // 修复情形4: 连续的编号参数
					series.forEach((arg, i) => {
						const name = `${str}${i + 1}`;
						if (arg.name !== name) {
							arg.rename(name, true);
						}
					});
				} else {
					numbered.push(key);
				}
			} else {
				error(`页面 ${pageid} 中模板 ${token.name} 的重复参数 ${key.replaceAll('\n', '\\n')} 均非空！`);
			}
		});
		if (numbered.length) {
			info(`页面 ${pageid} 中模板 ${token.name} 的参数名如下：`);
			token.slice(1).forEach(({name}) => {
				if (!/\d+$/.test(name)) {
					return;
				}
				(numbered.includes(name) ? error : console.log)(name);
			});
		}
	}).toString();
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
