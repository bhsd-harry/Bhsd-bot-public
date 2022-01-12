/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{ping, info, save} = require('./dev.js');

let {http, https} = require('./exturl.json'),
	redirects;

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
		].filter(site => !http.includes(site));
	});
	const domains = [...new Set(ext.map(({domain}) => domain).flat())].filter(ele => !https.includes(ele));
	if (domains.length > 0) { // 否则直接跳过，开始生成编辑
		const responses = await Promise.allSettled(domains.map(ele => ping(`https://${ele}`)));
		redirects = responses.filter(({reason}) => Array.isArray(reason)).map(({reason}) => reason);
		const redirected = redirects.filter(([, url]) => url.startsWith('https://')).map(([url]) => url.slice(8)),
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
	ext.forEach(ele => {
		ele.domain = ele.domain.filter(site => https.includes(site));
	});
	if (domains.length > 0) {
		https = https.filter(url => !url.includes('/'));
		save('exturl.json', {http, https});
	}
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
	if (redirects) {
		info('检测到以下重定向：');
		redirects.forEach(([oldUrl, newUrl]) => {
			console.log(`${oldUrl} → ${newUrl}`);
		});
	}
})();