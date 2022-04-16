/**
 * @Function: 用于修复引自bilibili的图片
 */
'use strict';
const Api = require('../lib/api.js'),
	{user, pin, url} = require('../config/user.json'),
	{error, runMode} = require('../lib/dev.js');

const regex = /https:\/\/(?:i\d\.hdslb\.com|w[wx]\d\.sinaimg\.cn)\/[^\s[\]<>"|{}]+\.(?:jpe?g|png|gif|tiff|bmp)/gi;

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复引自bilibili或新浪的图片外链');
			return;
		}
	}

	const _search = site => api.search(`insource:"https://${site}"`);

	// i[0-2].hdslb.com或ww[1-4].sinaimg.cn
	const pages = (await Promise.all([
		...new Array(3).fill().map((_, i) => _search(`i${i}.hdslb.com`)),
		...new Array(4).fill().map((_, i) => _search(`ww${i + 1}.sinaimg.cn`)),
		...new Array(4).fill().map((_, i) => _search(`wx${i + 1}.sinaimg.cn`)),
	])).flat();
	const pageids = [...new Set(pages.map(({pageid}) => pageid))],
		edits = pageids.map(pageid => pages.find(({pageid: id}) => id === pageid))
			.map(({pageid, content, timestamp, curtimestamp}) => {
				const urls = content.match(regex);
				if (!urls) {
					error(`页面 ${pageid} 找不到图片链接！`);
					return null;
				}
				let text = content;
				urls.forEach(imgUrl => {
					text = text.replace(imgUrl, `http://${imgUrl.slice(8)}`);
				});
				return [pageid, content, text, timestamp, curtimestamp];
			}).filter(edit => edit);
	await api.massEdit(edits, mode, '自动修复引自bilibili或新浪的图片外链');
};

if (!module.parent) {
	main();
}

module.exports = main;
