/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{ping, info} = require('./dev.js');

const api = new Api(user, pin, 'https://zh.moegirl.org.cn'),
	[,, mode] = process.argv,
	caution = /^www\.(?:typemoon\.com|gov.cn)/;

(async () => {
	const date = new Date();
	date.setDate(date.getDate() - 1);
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	const ext = (await api.taggedRecentChanges('非https地址插入', date.toISOString()))
		.filter(({content}) => content.includes('http://'));
	ext.forEach(ele => {
		const candidates = (ele.content.match(/(?<=[^/]http:\/\/)[\S]+/g) || [])
			.filter(site => site.includes('.') && !/^i\d\.hdslb\.com$/.test(site));
		ele.domain = [
			...candidates.filter(site => caution.test(site)),
			...candidates.filter(site => !caution.test(site)).map(site => site.split('/', 1)[0])
		];
	});
	const domains = [...new Set(ext.map(({domain}) => domain).flat())],
		responses = await Promise.allSettled(domains.map(ele => ping(`https://${ele}`)));
	const redirects = responses.filter(({reason}) => Array.isArray(reason)).map(({reason}) => reason),
		redirected = redirects.filter(([, url]) => url.startsWith('https://')).map(([url]) => url.slice(8)),
		https = [
		...responses.filter(({status}) => status === 'fulfilled').map(({value}) => value.slice(8)),
		...redirected
	];
	ext.forEach(ele => {
		ele.domain = ele.domain.filter(site => https.includes(site));
	});
	const known = ext.filter(({domain}) => domain.length > 0),
		edits = known.map(({pageid, content, domain}) => {
		let text = content;
		domain.forEach(site => {
			text = text.replaceAll(`http://${site}`, `https://${site}`);
		});
		if (text === content) {
			return null;
		}
		return [pageid, content, text];
	}).filter(edit => edit);
	await api.massEdit(edits, mode, '自动修复http链接');
	info('检测到以下重定向：');
	redirects.forEach(([oldUrl, newUrl]) => {
		console.log(`${oldUrl} → ${newUrl}`);
	});
	console.log(known.filter(({domain}) => domain.some(site => redirected.includes(site))).map(({pageid}) => pageid));
})();