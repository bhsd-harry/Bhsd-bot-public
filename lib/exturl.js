/**
 * @Function: 提供一个标准函数，用于修复指定文本中的http链接
 */
'use strict';
const {ping, save, error, info, urlRegex, parse, wayback} = require('./dev'),
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
 * @returns {Promise<[string[], string[], ?true]>}
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
 * @param {?Interface} chat - 命令行交互对象
 * @returns {promise}
 * @fulfill {Array.<[number, string, string]>}
 */
const exturl = async (pages, chat) => {
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
		text = await broken(text, pageid, chat); // eslint-disable-line require-atomic-updates
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
 * @param {?Interface} chat - 命令行交互对象
 * @param {?boolean} force - 是否总是检查
 * @returns {Promise<string>}
 */
const broken = async (content, pageid, chat, force) => {
	const parsed = parse(content);
	if (!force && parsed.find_template(['Dead link', 'Deadlink', '死链', '死鏈', '失效链接', '失效鏈接'])) {
		info(`页面 ${pageid} 已标注失效链接。`);
		return content.toString();
	}
	let urls = [];
	parsed.each('url', token => {
		if (!token.dead) {
			urls.push(token[0].replace(/^\/\//, 'https://'));
		}
	});
	urls = [...new Set(urls)];
	const responses = (await Promise.all(urls.map(url => ping(url, true))))
		.filter(([, code]) => code === 404).map(([url]) => url);
	if (responses.length === 0) {
		if (force) {
			info(`页面 ${pageid} 中未发现更多失效链接。`);
		}
		return content.toString();
	}
	await parsed.each('url', async (token, _, parent) => {
		const link = token[0].replace(/^\/\//, 'https://');
		if (responses.includes(link)) {
			const template = await archive(link, chat);
			if (parent.type !== 'external_link') {
				token[0] = template ?? `${token[0]}{{失效链接}}`; // eslint-disable-line require-atomic-updates
				return;
			}
			const {toString} = parent;
			parent.toString = template
				? function() {
					const [,, text = ''] = this;
					return `${text && `${text}：`}${template}`;
				}
				: function() {
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

/**
 * 将失效链接替换为网页存档
 * @param {string} link
 * @param {?Interface} chat - 命令行交互对象
 * @returns {?string}
 */
const archive = async (link, chat) => {
	const response = await wayback(link);
	if (!response) {
		return null;
	}
	const [url, date, htmlTitle, lang = ''] = response;
	if (!htmlTitle) {
		error(`存档链接 ${url} 缺失<title>标签！`);
		return `{{Cite web|url=${link}${
			lang && lang !== 'zh' && `|lang=${lang}`
		}|archive-url=${url}|archive-date=${date}|dead-url=yes}}`;
	}
	if (chat) {
		chat.set(str => `可能的title：${str}\n请输入正确的标题或跳过：`);
	}
	const title = chat && await chat.push(htmlTitle) || htmlTitle.replaceAll('|', '{{!}}');
	return `{{Cite web|url=${link}|${lang && lang !== 'zh'
		? `language=${lang}|script-title=${lang}:`
		: 'title='
	}${title}|archive-url=${url}|archive-date=${date}|dead-url=yes}}`;
};

module.exports = {update, exturl, sort, broken, archive};
