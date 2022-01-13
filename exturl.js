/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{ping, info, save, error} = require('./dev.js'),
	params = require('./exturlquery.json'),
	{euquery} = params;

let {http, https} = require('./exturl.json');

const api = new Api(user, pin, 'https://zh.moegirl.org.cn'),
	[,, mode] = process.argv,
	caution = /^www\.(?:typemoon\.com|gov\.cn)/;

(async () => {
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		const c = require('./euoffset.json');
		await api.massEdit(null, mode, '自动修复http链接');
		save('exturlquery.json', {euquery, ...c});
		return;
	}
	const [pages, c] = await api.extSearch({...params, geuquery: euquery});
	if (pages.length > 0) { // 否则直接跳过，记录euoffset
		pages.forEach(page => {
			page.domains = [...new Set(page.urls.map(url => {
				const [domain] = url.slice(7).split('/', 1);
				if (caution.test(domain)) {
					return url.slice(7);
				}
				return domain;
			}))].filter(domain => !http.includes(domain));
			delete page.urls;
		});
		const unknown = [...new Set(pages.map(({domains}) => domains).flat())].filter(domain => !https.includes(domain));
		if (unknown.length > 0) { // 否则直接跳过，开始生成编辑
			const responses = await Promise.allSettled(unknown.map(ele => ping(`https://${ele}`)));
			const redirects = responses.filter(({reason}) => Array.isArray(reason)).map(({reason}) => reason),
				redirected = redirects.filter(([, url]) => url.startsWith('https://')).map(([url]) => url.slice(8)),
				unredirected = redirects.filter(([, url]) => url.startsWith('http://')).map(([url]) => url.slice(8));
			https = [
				...https, ...redirected,
				...responses.filter(({status}) => status === 'fulfilled').map(({value}) => value.slice(8))
			];
			http = [
				...http, ...unredirected,
				...responses.filter(({reason}) => typeof reason === 'string' && !reason.slice(8).includes('/'))
					.map(({reason}) => reason.slice(8))
			];
		}
		pages.forEach(page => {
			page.domains = page.domains.filter(domain => https.includes(domain));
		});
		https = https.filter(url => !url.includes('/'));
		save('exturl.json', {http, https});
		const known = pages.filter(({domains}) => domains.length > 0),
			edits = known.map(({pageid, content, domains}) => {
			let text = content;
			domains.forEach(domain => {
				if (text.includes(domain)) {
					text = text.replaceAll(`http://${domain}`, `https://${domain}`);
				} else {
					error(`页面 ${pageid} 找不到链接 http://${domain} ！`);
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
		save('euoffset.json', c);
		info(c ? `下次检查从 ${c.euoffset} 开始。` : '已全部检查完毕！');
	} else {
		save('exturlquery.json', {euquery, ...c});
	}
})();