/**
 * @Function: 检查[[Category:使用无效自封闭HTML标签的页面]]并修复
 */
'use strict';
const {user, pin} = require('./user.json'),
	Api = require('./api.js'),
	{info, error} = require('./dev.js');

const url = 'https://zh.moegirl.org.cn',
	api = new Api(user, pin, url),
	[,, mode] = process.argv;

(async () => {
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode, '自动修复无效自封闭的HTML标签');
		return;
	}
	const tags = ['b', 'bdi', 'del', 'i', 'ins', 'u', 'font', 'big', 'small', 'sub', 'sup', 'h[1-6]', 'cite', 'code',
		'em', 's', 'strike', 'strong', 'tt', 'var', 'div', 'center', 'blockquote', 'ol', 'ul', 'dl', 'table',
		'caption', 'pre', 'ruby', 'rb', 'rp', 'rt', 'rtc', 'p', 'span', 'abbr', 'dfn', 'kbd', 'samp', 'data', 'time',
		'mark', 'li', 'dt', 'dd', 'td', 'th', 'tr'
	],
		regex = new RegExp(`<(${tags.join('|')})(?:\\s+[^>]*?)?/>`, 'gi'),
		pages = await api.categorymembers('使用无效自封闭HTML标签的页面');
	const list = pages.map(({pageid, content}) => {
		if (!regex.test(content)) {
			error(`页面 ${pageid} 未找到无效自封闭的HTML标签！`);
			return null;
		}
		const text = content.replace(regex, (p0, p1) => {
			if (p0.slice(p1.length + 1, -2)) { // 这大概率是一个独立标签
				return `${p0.slice(0, -2)}></${p1}>`;
			}
			// 这大概率是一个错误的闭合标签
			return `</${p1}>`;
		});
		return [pageid, content, text];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复无效自封闭的HTML标签');
	info('检查完毕！');
})();