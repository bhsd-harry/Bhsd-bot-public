/**
 * @Function: 提供一个标准函数，用于修复指定文本中的http链接
 */
'use strict';
const {ping, save, error, info, urlRegex, parse} = require('./dev'),
	{regexSource} = require('../config/exturl'); // 仅手动更新

let {http, https} = require('../config/exturl'),
	flag;

const caution = /^(?:www\.typemoon\.com|www\.gov\.cn|moba\.163\.com)/;

const _save = () => {
	return save('../../Bhsd-bot-public/config/exturl.json', {http, https, regexSource});
};

const _format = url => url.replace(/:\d+$/, '').split('.').reverse().join('.');

const _sort = (a, b) => _format(a) < _format(b) ? -1 : 1;

/**
 * 更新http和https列表
 * @param {string[]} domains - 小写网站地址，可以有重复
 * @returns {Promise.<[string[], string[], ?true]>}
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
 * 将页面内的http替换为https
 * @param {Array.<[number, string]>} pages
 * @returns {promise}
 * @fulfill {Array.<[number, string, string]>}
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
		text = await broken(text, pageid); // eslint-disable-line require-atomic-updates
		if (text === oldContent) {
			return null;
		}
		return [pageid, oldContent, text, timestamp, curtimestamp];
	}))).filter(edit => edit);
};

/**
 * 标注失效链接
 * @param {string} content
 * @param {number} pageid
 * @returns {Promise.<string>}
 */
const broken = async (content, pageid) => {
	const parsed = parse(content);
	if (parsed.find_template(['Dead link', 'Deadlink', '死链', '死鏈', '失效链接', '失效鏈接'])) {
		info(`页面 ${pageid} 已标注失效链接。`);
		return content;
	}
	let urls = [];
	parsed.each('url', token => {
		urls.push(token[0].replace(/^\/\//, 'https://'));
	});
	urls = [...new Set(urls)];
	const responses = (await Promise.all(urls.map(url => ping(url, true))))
		.filter(([, code]) => code === 404).map(([url]) => url);
	if (responses.length === 0) {
		return content;
	}
	parsed.each('url', (token, _, parent) => {
		const link = token[0].replace(/^\/\//, 'https://');
		if (responses.includes(link)) {
			if (parent.type !== 'external_link') {
				token[0] += '{{失效链接}}';
				return;
			}
			const {toString} = parent;
			parent.toString = function() {
				return `${toString.call(this)}{{失效链接}}`;
			};
		}
	});
	return parsed.toString();
};

/**
 * 给http和https列表排序
 * @returns {promise}
 */
const sort = async () => {
	http = http.sort(_sort);
	https = https.sort(_sort);
	await _save();
};

module.exports = {update, exturl, sort, broken};
