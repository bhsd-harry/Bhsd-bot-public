/**
 * @Function: 用于修复引自bilibili的图片
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{error} = require('./dev.js');

const api = new Api(user, pin, 'https://zh.moegirl.org.cn'),
	[,, mode] = process.argv;

(async () => {
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	const pages = (await Promise.all(new Array(10).fill().map((_, i) =>
		api.search(`insource:"https://i${i}.hdslb.com" -hastemplate:"Noreferer"`)
	))).flat();
	const pageids = [...new Set(pages.map(({pageid}) => pageid))],
		edits = pageids.map(pageid => pages.find(({pageid: id}) => id === pageid)).map(({pageid, content}) => {
		const urls = content.match(/https:\/\/i\d\.hdslb\.com\/[\S]+\.(?:jpe?g|png|gif|tiff|bmp)/gi);
		if (!urls) {
			error(`页面 ${pageid} 找不到图片链接！`);
			return null;
		}
		let text = content;
		urls.forEach(url => {
			text = text.replace(url, `http://${url.slice(8)}`);
		});
		return [pageid, content, text];
	}).filter(edit => edit);
	api.massEdit(edits, mode, '自动修复引自bilibili的图片外链');
})();