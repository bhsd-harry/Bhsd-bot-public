/**
 * @Function: 提供一个标准函数，用于修复指定文本中的http链接
 */
'use strict';
const {ping, save, error, info} = require('./dev.js'),
	{regexSource} = require('./exturl.json'); // 仅手动更新

let {http, https} = require('./exturl.json'),
	flag;

const caution = /^www\.(?:typemoon\.com|gov\.cn)/;

/**
 * @param domains, 小写网站地址组成的数组，可以有重复
 */
const update = async (domains) => {
	const unknown = [...new Set(domains)].filter(domain => !https.includes(domain));
	if (unknown.length === 0) {
		return [http, https];
	}
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
		...responses.filter(({reason}) => typeof reason === 'string').map(({reason}) => reason.slice(8))
	].filter(url => !url.includes('/'));
	if (redirects.length > 0) {
		info('检测到以下重定向：');
		redirects.forEach(([oldUrl, newUrl]) => {
			console.log(`${oldUrl} → ${newUrl}`);
		});
	}
	return [http, https, true];
};

/**
 * @param pages, 形如{pageid, content}的标准对象构成的数组
 * @return edits, 形如[pageid, content, text]的标准数组构成的数组
 */
const exturl = async (pages) => {
	const regex = new RegExp(`^(?:${regexSource.join('|')})`, 'i');
	pages.forEach(page => {
		page.urls = [...new Set((page.content.match(/(?<=[^/]http:\/\/)[\S]+/g) || [])
			.filter(url => url.includes('.') && !regex.test(url)))];
		page.domains = [...new Set([
			...page.urls.filter(url => caution.test(url)),
			...page.urls.filter(url => !caution.test(url)).map(url => url.split('/', 1)[0])
		].map(domain => domain.toLowerCase()))].filter(domain => !http.includes(domain));
	});
	[http, https, flag] = await update(pages.map(({domains}) => domains).flat());
	pages.forEach(page => {
		page.domains = page.domains.filter(domain => https.includes(domain));
		page.urls = page.urls.filter(url => page.domains.some(domain => url.toLowerCase().startsWith(domain)));
	});
	if (flag) {
		https = https.filter(url => !url.includes('/'));
		save('../Bhsd-bot-public/exturl.json', {http, https, regexSource});
	}
	return pages.filter(({urls}) => urls.length > 0).map(({pageid, content, urls}) => {
		let text = content;
		urls.forEach(url => {
			if (text.includes(url)) {
				text = text.replaceAll(`http://${url}`, `https://${url}`);
			} else {
				error(`页面 ${pageid} 找不到链接 http://${url} ！`);
			}
		});
		if (text === content) {
			return null;
		}
		return [pageid, content, text];
	}).filter(edit => edit);
};

module.exports = {update, exturl};