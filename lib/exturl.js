/**
 * @Function: 提供一个标准函数，用于修复指定文本中的http链接
 */
'use strict';
const {ping, save, error, info, urlRegex, parse} = require('./dev'),
	{regexSource} = require('../config/exturl'), // 仅手动更新
	badUrls = require('../config/bad');

let {http, https} = require('../config/exturl'),
	flag;

const caution = /^(?:www\.typemoon\.com|www\.gov\.cn|moba\.163\.com)/;

const _save = () => {
	return save('../../Bhsd-bot-public/config/exturl.json', {http, https, regexSource});
};

const _format = url => url.replace(/:\d+$/, '').split('.').reverse().join('.');

const _sort = (a, b) => _format(a) < _format(b) ? -1 : 1;

/**
 * @param domains, 小写网站地址组成的数组，可以有重复
 */
const update = async domains => {
	const unknown = [...new Set(domains)].filter(domain => ![...http, ...https].includes(domain));
	if (unknown.length === 0) {
		return [http, https];
	}
	const responses = await Promise.allSettled(unknown.map(ele => ping(`https://${ele}`)));
	const redirects = responses.filter(({reason}) => Array.isArray(reason)).map(({reason}) => reason),
		redirected = redirects.filter(([, url]) => url.startsWith('https://')).map(([url]) => url.slice(8)),
		unredirected = redirects.filter(([, url]) => url.startsWith('http://')).map(([url]) => url.slice(8));
	https = [
		...https, ...redirected,
		...responses.filter(({status}) => status === 'fulfilled').map(({value}) => value.slice(8)),
	];
	http = [
		...http, ...unredirected,
		...responses.filter(({reason}) => typeof reason === 'string').map(({reason}) => reason.slice(8)),
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
const exturl = async pages => {
	const regex = new RegExp(`(?<=[^/]http://)${urlRegex}+`, 'g'),
		regexException = new RegExp(`^(?:${regexSource.join('|')})`, 'i');
	pages.forEach(page => {
		page.urls = [...new Set((page.content.match(regex) || [])
			.filter(url => url.includes('.') && !regexException.test(url)))];
		page.domains = [...new Set([
			...page.urls.filter(url => caution.test(url)),
			...page.urls.filter(url => !caution.test(url)).map(url => url.split('/', 1)[0]),
		].map(domain => domain.toLowerCase()))];
	});
	[http, https, flag] = await update(pages.flatMap(({domains}) => domains));
	pages.forEach(page => {
		page.domains = page.domains.filter(domain => https.includes(domain));
		page.urls = page.urls.filter(url => page.domains.some(domain => url.toLowerCase().startsWith(domain)));
	});
	if (flag) {
		https = https.filter(url => !url.includes('/'));
		await _save();
	}
	return (await Promise.all(pages.map(async ({pageid, content, oldContent, urls, timestamp, curtimestamp}) => {
		let text = content;
		oldContent ||= content; // eslint-disable-line no-param-reassign
		urls.forEach(url => {
			if (text.includes(url)) {
				text = text.replaceAll(`http://${url}`, `https://${url}`);
			} else {
				error(`页面 ${pageid} 找不到链接 http://${url} ！`);
			}
		});
		text = await broken(pageid, text, true) ?? text; // eslint-disable-line require-atomic-updates
		if (text === oldContent) {
			return null;
		}
		return [pageid, oldContent, text, timestamp, curtimestamp];
	}))).filter(edit => edit);
};

const broken = async (pageid, content, recheck = pageid in badUrls) => {
	const regex = new RegExp(`(?<=\\[)(?:https?:)?//${urlRegex}+`, 'gi'),
		urls = badUrls[pageid] ?? [...new Set(content.match(regex)?.map(url => url.replace(/^\/\//, 'https://')))],
		responses = (await Promise.all(urls.map(url => ping(url, true))))
			.filter(([, code]) => code === 404).map(([url]) => url);
	if (!recheck) {
		badUrls[pageid] = responses; // eslint-disable-line require-atomic-updates
		await save('../../Bhsd-bot-public/config/bad.json', badUrls);
		return;
	} else if (pageid in badUrls) {
		delete badUrls[pageid];
		await save('../../Bhsd-bot-public/config/bad.json', badUrls);
	}
	const parsed = parse(content);
	if (responses.length) {
		parsed.each('external_link', token => {
			const link = token.find(({type}) => type === 'url')[0].replace(/^\/\//, 'https://');
			if (responses.includes(link)) {
				const {toString} = token;
				token.toString = function() {
					return `${toString.call(this)}{{失效链接}}`;
				};
			}
		});
	}
	return parsed.toString();
};

const sort = async () => {
	http = http.sort(_sort);
	https = https.sort(_sort);
	await _save();
};

module.exports = {update, exturl, sort};
