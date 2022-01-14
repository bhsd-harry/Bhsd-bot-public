/**
 * @Function: 用于修复引自bilibili的图片
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{error} = require('./dev.js');

const api = new Api(user, pin, 'https://zh.moegirl.org.cn'),
	[,, mode] = process.argv,
	regex = /https:\/\/(?:i\d\.hdslb\.com|ww\d\.sinaimg\.cn)\/[\S]+\.(?:jpe?g|png|gif|tiff|bmp)/gi;

const search = (site) => api.search(`insource:"https://${site}" -hastemplate:"NoReferer"`);

(async () => {
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode, '自动修复引自bilibili或新浪的图片外链');
		return;
	}
	// i[0-2].hdslb.com或ww[1-4].sinaimg.cn
	const pages = (await Promise.all([
		...new Array(3).fill().map((_, i) => search(`i${i}.hdslb.com`)),
		...new Array(4).fill().map((_, i) => search(`ww${i + 1}.sinaimg.cn`))
	])).flat();
	const pageids = [...new Set(pages.map(({pageid}) => pageid))],
		edits = pageids.map(pageid => pages.find(({pageid: id}) => id === pageid)).map(({pageid, content}) => {
		const urls = content.match(regex);
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
	api.massEdit(edits, mode, '自动修复引自bilibili或新浪的图片外链');
})();