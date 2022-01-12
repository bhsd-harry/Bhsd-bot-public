/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{ping, info, save, error} = require('./dev.js'),
	{euquery} = require('./exturlquery.json');

let {http, https} = require('./exturl.json'),
	{euoffset} = require('./exturlquery.json');

const api = new Api(user, pin, 'https://zh.moegirl.org.cn'),
	[,, mode] = process.argv,
	caution = /^www\.(?:typemoon\.com|gov.cn)/,
	allKnown = [...http, ...https];

(async () => {
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	const [ext, c] = await api.extUrl({euquery, euoffset}, null);
	euoffset = c?.euoffset; // eslint-disable-line require-atomic-updates
	if (Array.isArray(ext) && ext.length > 0) { // 否则直接跳过，记录euoffset
		ext.forEach(ele => {
			[ele.domain] = ele.url.slice(7).split('/', 1);
			if (caution.test(ele.domain)) {
				ele.domain = ele.url.slice(7);
			}
		});
		const unknown = ext.filter(({domain}) => !allKnown.includes(domain));
		if (unknown.length > 0) { // 否则直接跳过，开始生成编辑
			const domains = [...new Set(unknown.map(({domain}) => domain))],
				responses = await Promise.allSettled(domains.map(ele => ping(`https://${ele}`)));
			const redirects = responses.filter(({reason}) => Array.isArray(reason)).map(({reason}) => reason),
				redirected = redirects.filter(([, url]) => url.startsWith('https://')).map(([url]) => url.slice(8));
			https = [
				...https, ...redirected,
				...responses.filter(({status}) => status === 'fulfilled').map(({value}) => value.slice(8))
			];
			http = [
				...http,
				...responses.filter(({reason}) => typeof reason === 'string' && !reason.slice(8).includes('/'))
					.map(({reason}) => reason.slice(8))
			];
		}
		const known = ext.filter(({domain}) => https.includes(domain)),
			pageids = [...new Set(known.map(({pageid}) => pageid))].join('|'); // 一个页面可能有多个http链接
		if (unknown.length > 0) {
			https = https.filter(url => !url.includes('/'));
			save('exturl.json', {http, https});
		}
		const edits = (await api.revisions(pageids)).map(({pageid, content}) => {
			const urls = known.filter(({pageid: id}) => id === pageid).map(({url}) => url);
			let text = content;
			urls.forEach(url => {
				if (text.includes(url)) {
					text = text.replaceAll(url, `https://${url.slice(7)}`);
				} else {
					error(`页面 ${pageid} 找不到链接 ${url} ！`);
				}
			});
			if (text === content) {
				return null;
			}
			return [pageid, content, text];
		}).filter(edit => edit);
		await api.massEdit(edits, mode, '自动修复http链接');
	}
	if (mode === 'dry') {
		info(euoffset ? `下次检查从 ${euoffset} 开始。` : '已全部检查完毕！');
	} else {
		save('exturlquery.json', {euquery, euoffset});
	}
})();