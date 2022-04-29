/**
 * @Function: 检查[[Category:使用无效自封闭HTML标签的页面]]并修复
 */
'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{error, runMode} = require('../lib/dev');

const _analyze = (content, regex) => {
	const ambiguous = [],
		count = {};
	let text = content.replace(regex, (p0, p1) => {
		if (p0.slice(p1.length + 1, -2)) { // 这大概率是一个独立标签
			return `${p0.slice(0, -2)}></${p1}>`;
		}
		const key = p1.toLowerCase();
		if (!(key in count)) {
			ambiguous.push(key);
			count[key] = 0;
		}
		return p0;
	});
	if (ambiguous.length) {
		const regexp = new RegExp(`<(/?)(${ambiguous.join('|')})(/?)`, 'gi');
		let adjust = 0,
			key;
		for (const {0: mt, 1: close, 2: tag, 3: selfClose, index} of text.matchAll(regexp)) {
			key = tag.toLowerCase();
			if (close) {
				count[key]--;
			} else if (!selfClose) {
				count[key]++;
			} else {
				const start = index + adjust;
				if (count[key] > 0) { // 这大概率是一个错误的闭合标签
					text = `${text.slice(0, start)}</${key}${text.slice(start + mt.length)}`;
					count[key]--;
				} else { // 这大概率是一个独立标签
					text = `${text.slice(0, start)}<${key}></${key}${text.slice(start + mt.length)}`;
					adjust += key.length + 2;
				}
			}
		}
	}
	return text;
};

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode(),
		tags = [ // 同步自CodeMirror扩展，移除了空标签和非HTML标签
			'b', 'bdi', 'del', 'i', 'ins',
			'u', 'font', 'big', 'small', 'sub', 'sup',
			'h[1-6]', 'cite',
			'code', 'em', 's', 'strike', 'strong', 'tt',
			'var', 'div', 'center', 'blockquote', 'q', 'ol', 'ul',
			'dl', 'table', 'caption', 'pre', 'ruby', 'rb',
			'rp', 'rt', 'rtc', 'p', 'span', 'abbr', 'dfn',
			'kbd', 'samp', 'data', 'time', 'mark',
			'li', 'dt', 'dd', 'td', 'th',
			'tr',
		],
		testRegex = new RegExp(`<(${tags.join('|')})(?:\\s+[^>]*?)?/>`, 'i'), // 用于test时不能有g修饰符
		replaceRegex = new RegExp(testRegex, 'gi');
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复无效自封闭的HTML标签');
			return;
		}
	}
	const pages = await api.categorymembers('使用无效自封闭HTML标签的页面');
	const list = pages.map(({pageid, content, timestamp, curtimestamp}) => {
		if (!testRegex.test(content)) {
			error(`页面 ${pageid} 未找到无效自封闭的HTML标签！`);
			return null;
		}
		const text = _analyze(content, replaceRegex);
		return [pageid, content, text, timestamp, curtimestamp];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复无效自封闭的HTML标签');
};

if (!module.parent) {
	main();
}

module.exports = main;
