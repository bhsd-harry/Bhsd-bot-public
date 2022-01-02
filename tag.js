/**
 * @Function: 1. 检查[[Category:使用无效自封闭HTML标签的页面]]并修复
 *            2. 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复
 */
'use strict';
const {user, pin} = require('./user.json'),
	Api = require('./api.js'),
	{info, error, cmd} = require('./dev.js'),
	{promises: fs} = require('fs');

const url = 'https://zh.moegirl.org.cn',
	api = new Api(user, pin, url);

(async () => {
	if (process.argv[2] !== 'dry') {
		await api.csrftoken();
	}
	const tags = ['b', 'bdi', 'del', 'i', 'ins', 'u', 'font', 'big', 'small', 'sub', 'sup', 'h[1-6]', 'cite', 'code',
		'em', 's', 'strike', 'strong', 'tt', 'var', 'div', 'center', 'blockquote', 'ol', 'ul', 'dl', 'table',
		'caption', 'pre', 'ruby', 'rb', 'rp', 'rt', 'rtc', 'p', 'span', 'abbr', 'dfn', 'kbd', 'samp', 'data', 'time',
		'mark', 'li', 'dt', 'dd', 'td', 'th', 'tr'
	],
		regex = new RegExp(`<(${tags.join('|')})(?:\\s+[^>]*?)?/>`, 'gi'),
		pages = await api.categorymembers('Category:使用无效自封闭HTML标签的页面');
	pages.map(({pageid, content}) => {
		const mistakes = content.match(regex);
		if (!mistakes) {
			error(`页面 ${pageid} 未找到无效自封闭的HTML标签！`);
			return undefined;
		}
		const text = content.replace(regex, (p0, p1) => {
			if (p0.slice(p1.length + 1, -2).trim()) { // 这大概率是一个独立标签
				return `${p0.slice(0, -2)}></${p1}>`;
			}
			// 这大概率是一个错误的闭合标签
			return `</${p1}>`;
		});
		return [pageid, content, text];
	}).filter(page => page).forEach(async ([pageid, content, text], i) => {
		if (process.argv[2] === 'dry') {
			await Promise.all([fs.writeFile(`oldcontent${i}`, content), fs.writeFile(`newcontent${i}`, text)]);
			const diff = await cmd(`diff oldcontent${i} newcontent${i}`);
			cmd(`rm oldcontent${i} newcontent${i}`);
			info(`${pageid}:`);
			console.log(diff);
			return;
		}
		api.edit({pageid, text, summary: '自动修复无效自封闭的HTML标签，如有错误请联系[[User talk:Bhsd|用户Bhsd]]'});
	});
	info('检查完毕！');
})();