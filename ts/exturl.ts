/**
 * @Function: 提供一个标准函数，用于修复指定文本中的http链接
 */
'use strict';

import {promises} from 'fs';
import Parser from 'wikiparser-node';
import {ping, save, error, info, urlRegex, wayback} from '../lib/dev';
const {regexSource} = require('../config/exturl'); // 仅手动更新
Parser.config = './config/moegirl';

let {http, https} = require('../config/exturl'),
	flag;

const _save = () => {
	return save('../../Bhsd-bot-public/config/exturl.json', {http, https, regexSource});
};

const _format = url => url.replace(/:\d+$/, '').split('.').reverse().join('.');

const _sort = (a, b) => _format(a) < _format(b) ? -1 : 1;

const _templates = names => names.map(name => `template#Template\\:${name}`).join();

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
	const responses: ({status: 'fulfilled' | 'rejected', value?: string, reason?: string | [string, string]})[] =
		await Promise.allSettled(unknown.map(ele  => ping(`https://${ele}`, false)));
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
		for (const [oldUrl, newUrl] of redirects) {
			console.log(`${oldUrl} → ${newUrl}`);
		}
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
const exturl = async (pages: {
	content: string, pageid: number, oldContent: string, timestamp: string, curtimestamp: string, domains?: string[], urls?: string[]
}[], chat) => {
	const caution = /^(?:w{3}\.typemoon\.com|moba\.163\.com)/,
		regex = new RegExp(`(?<=[^/]http://)${urlRegex}+`, 'g'),
		regexException = new RegExp(`^(?:${regexSource.join('|')})`, 'i');
	for (const page of pages) {
		page.urls = [...new Set((page.content.match(regex) || [])
			.filter(url => url.includes('.') && !regexException.test(url)))]
			.map(url => {
				if (/^\W*(?:t\W*i\W*e\W*b\W*a|p\W*a\W*n)[^\w.]*\.\W*b\W*a\W*i\W*d\W*u[^\w.]*\.\W*c\W*o\W*m\//i.test(url)) {
					const pieces = url.split('/');
					return `${pieces[0].replace(/[^\w.]/g, '')}/${pieces.slice(1).join('/')}`;
				} else if (/^https?:/i.test(url)) {
					error(`页面 ${page.pageid} 发现错误URL：http://${url}`);
				}
				return url;
			});
		page.domains = [...new Set([
			...page.urls.filter(url => caution.test(url)),
			...page.urls.filter(url => !caution.test(url)).map(url => url.split('/', 1)[0]),
		].map(domain => domain.toLowerCase()))];
		const wrongDomains = page.domains.filter(domain => domain.includes('*'));
		if (wrongDomains.length) {
			error(`页面 ${page.pageid} 检测到错误站点：\n${wrongDomains.join('\n')}`);
		}
	}
	[http, https, flag] = await update(pages.flatMap(({domains}) => domains));
	for (const page of pages) {
		page.domains = page.domains.filter(domain => https.includes(domain)); // eslint-disable-line no-loop-func
		page.urls = page.urls.filter(url => page.domains.some(domain => url.toLowerCase().startsWith(domain)));
	}
	if (flag) {
		https = https.filter(url => !url.includes('/'));
		await _save();
	}
	const edits = (await Promise.all(pages.map(async ({pageid, content, oldContent, urls, timestamp, curtimestamp}) => {
		let text = content.replace(
			/(?<=\/\/)(?:[^\w/]\W*)?t\W*i\W*e\W*b\W*a[^\w.]*\.\W*b\W*a\W*i\W*d\W*u[^\w.]*\.\W*c\W*o\W*m\//gi,
			'tieba.baidu.com/',
		).replace(/(?<=\/\/)(?:[^\w/]\W*)?p\W*a\W*n[^\w.]*\.\W*b\W*a\W*i\W*d\W*u[^\w.]*\.\W*c\W*o\W*m\//gi, '');
		oldContent ||= content;
		for (const url of urls) {
			if (text.includes(url)) {
				text = text.replaceAll(`http://${url}`, `https://${url}`);
			} else {
				error(`页面 ${pageid} 找不到链接 http://${url} ！`);
			}
		}
		const result = await broken({content: text, pageid, timestamp, curtimestamp}, chat, undefined, undefined),
			[, nBroken, nArchived, nFailed] = result;
		[text] = result;
		if (text === oldContent) {
			return null;
		}
		return [pageid, oldContent, text, timestamp, curtimestamp, nBroken, nArchived, nFailed];
	}))).filter(edit => edit);
	try {
		delete require.cache[require.resolve('../config/broken-temp')];
		const temp = require('../config/broken-temp');
		await Promise.all([
			save('../config/broken.json', temp),
			promises.unlink('../config/broken-temp.json'),
		]);
	} catch {}
	return edits;
};

/**
 * 标注失效链接
 * @typedef {object} Page
 * @property {string|Token} content
 * @property {number} pageid
 * @property {string} timestamp
 * @property {string} curtimestamp
 * @param {Page}
 * @param {?Interface} chat - 命令行交互对象
 * @param {?boolean} force - 是否总是检查
 * @returns {Promise<string>}
 */
const broken = async ({content, pageid, timestamp, curtimestamp}, chat, force, incomplete) => {
	let archived = {};
	try {
		archived = require('../config/broken');
	} catch {}
	if (!incomplete && new Date(timestamp).getTime() <= new Date(archived[pageid]).getTime()) { // 无该页面记录时总是false
		info(`页面 ${pageid} 自上次检查失效链接以来无变动。`);
		return [content.toString()];
	}
	const parsed: Parser.Token = typeof content === 'string' ? Parser.parse(content, false, 9) : content,
		selectors = _templates(['Dead_link', 'Deadlink', '死链', '死鏈', '失效链接', '失效鏈接']),
		selectorsLang = _templates(['Ja', 'En']);
	if (!force && parsed.querySelector(selectors)) {
		info(`页面 ${pageid} 已标注失效链接。`);
		return [content.toString()];
	}
	let urls = [],
		deadUrls = [];
	for (const token of parsed.querySelectorAll<Parser.ExtLinkToken | Parser.MagicLinkToken>('ext-link-url,free-ext-link')) {
		if (token.type === 'free-ext-link' && token.isParamValue()) {
			continue;
		}
		token['main'] = token.type === 'free-ext-link' ? token : token.parentNode;
		const {previousElementSibling, nextElementSibling} = token['main'];
		token['dead'] = nextElementSibling?.matches(selectors) ? nextElementSibling : undefined;
		if (previousElementSibling?.matches(selectorsLang)) {
			token['langMark'] = previousElementSibling;
		} else if (nextElementSibling?.matches(selectorsLang)) {
			token['langMark'] = nextElementSibling;
		}
		if (!token['dead'] && token.text().endsWith('//')) {
			token.setText(token.text().slice(0, -1));
		}
		if (!(token['dead'] as Parser.TranscludeToken | undefined)?.hasArg('bot')) {
			(token['dead'] ? deadUrls : urls).push(token.text().replace(/^\/\//, 'https://'));
		}
	}
	for (const token of parsed.querySelectorAll<Parser.TranscludeToken>('template#Template\\:Cite_web, template#Template\\:Cite_news')) {
		const {nextElementSibling} = token;
		if (nextElementSibling?.matches(selectors)) {
			token['dead'] = nextElementSibling;
			token.setValue('dead-url', 'yes');
		}
		if (token.getValue('archive-url') || token.getValue('archiveurl')) {
			(token['dead'] as Parser.TranscludeToken | undefined)?.remove();
			continue;
		}
		token['main'] = token;
		if (!(token['dead'] as Parser.TranscludeToken | undefined)?.hasArg('bot')) {
			(token.getValue('dead-url') === 'yes' ? deadUrls : urls)
				.push(token.getValue('url').replace(/^\/\//, 'https://'));
		}
	}
	urls = [...new Set(urls)].filter(url => !/https?:\/\/(?:apps|itunes)\.apple\.com\//.test(url));
	const responses = (await Promise.allSettled(urls.map(url => ping(url, true))) as {value: [string, number]}[])
		.filter(({value}) => value?.[1] === 404).map(({value: [url]}) => url);
	if (!force && responses.length === 0) {
		archived[pageid] = curtimestamp;
		await save('../config/broken-temp.json', archived);
		return [parsed.toString()];
	}
	deadUrls = [...new Set([...deadUrls, ...responses])];
	let nBroken = 0,
		nArchived = 0,
		nFailed = 0;
	const tokens = parsed
		.querySelectorAll<Parser.MagicLinkToken | Parser.ExtLinkToken | Parser.TranscludeToken>('free-ext-link, ext-link-url, template#Template\\:Cite_web, template#Template\\:Cite_news')
		.filter(token => {
			if (token.type === 'free-ext-link' && token.isParamValue() || token.type === 'template' && !token['main']) {
				return false;
			}
			const link = (token.type === 'template' ? token.getValue('url') : token.text()).replace(/^\/\//, 'https://');
			return deadUrls.includes(link);
		});
	// 交互队列过长时，EventEmitter容易内存泄漏而出错
	if (tokens.length > 20) {
		error(`共有 ${tokens.length} 个失效链接待存档，本次仅检查前 20 个。`);
	}
	await Promise.all(tokens.slice(0, 20).map(async token => {
		const isTemplate = token.type === 'template';
		if (isTemplate && token.getValue('dead-url') !== 'yes') {
			token.setValue('dead-url', 'yes');
		}
		const link = (isTemplate ? token.getValue('url') : token.text()).replace(/^\/\//, 'https://'),
			[archiveUrl, date, template] = await archive(link, chat, isTemplate, undefined);
		if (!template && !token['dead']) {
			nBroken++;
			(token['main'] as Parser.Token).after('{{失效链接|bot=Bhsd-bot}}');
		} else if (template) {
			nArchived++;
			(token['dead'] as Parser.Token | undefined)?.remove();
			(token['langMark'] as Parser.Token | undefined)?.remove();
			if (token['langMark'] && isTemplate) {
				token.setValue('language', (token['langMark'] as Parser.TranscludeToken).name.slice(9).toLowerCase());
			}
			if (isTemplate) {
				token.setValue('archive-url', archiveUrl);
				token.setValue('archive-date', date);
			} else {
				(token['main'] as Parser.Token).replaceWith(template);
			}
		} else {
			nFailed++;
			(token['dead'] as Parser.TranscludeToken).setValue('bot', 'Bhsd-bot');
		}
	}));
	archived[pageid] = curtimestamp;
	await save('../config/broken-temp.json', archived);
	return [parsed.toString(), nBroken, nArchived, nFailed];
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
 * @param {string|Object.<'url'|'raw'|'timestamp', string>} link
 * @param {Interface} chat - 命令行交互对象
 * @param {boolean} isTemplate - 是否是Cite模板
 * @param {?boolean} retry - 是否是第二次尝试
 * @returns {[?string, ?string, ?string]}
 */
const archive = async (link, chat, isTemplate, retry) => {
	if (!chat) {
		throw new TypeError('第二个参数必须为Interface对象，请更新过期的archive方法！');
	} else if (typeof link === 'string') {
		link = shorten(link);
	}
	const response = await wayback(link);
	if (!response) {
		return [];
	}
	const [, date,, lang] = response;
	let [url,, htmlTitle = ''] = response,
		title;
	htmlTitle = htmlTitle.replaceAll('|', '{{!}}').replaceAll('~', '&#126;')
		.replace(/ - AcFun弹幕视频网 - 认真你就输啦 \(\?ω\?\)ノ- \( ゜- ゜\)つロ$/, '|website=AcFun弹幕视频网')
		.replace(/ - YouTube$/, '|website=YouTube');
	chat.set(str => `${str}\n请${isTemplate ? '确认' : '输入正确的标题或跳过'}：`);
	link = link.raw ?? link;
	title = await chat.push(
		`可能的title：${htmlTitle}\n对应的存档网址${retry ? '（第二次）' : ''}：${url}${
			link.startsWith('https://www.bilibili.com/video/BV') ? `\n原网址：${link}` : ''
		}`,
		{404: ['请输入正确的存档网址：']},
	);
	if (Array.isArray(title)) {
		[url] = title;
		return retry || !url ? [] : archive({raw: link, url, timestamp: url.slice(28, 42)}, chat, isTemplate, true);
	}
	title ||= htmlTitle;
	return [
		url,
		date,
		`{{Cite web|url=${link}|${lang && lang !== 'zh'
			? `language=${lang}|script-title=${lang}:`
			: 'title='
		}${title}|archive-url=${url}|archive-date=${date}|dead-url=yes}}`,
	];
};

/**
 * 移除bilibili和YouTube链接中的无用参数
 * @link https://github.com/syccxcc/MGP-bots/blob/master/bots/link_adjust.py
 * @param {string} link
 * @returns {string}
 */
const shorten = link => {
	// 引自https://github.com/syccxcc/MGP-bots/blob/master/bots/link_adjust.py
	const useless_bilibili = [
			'from', 'seid', 'spm_id_from', 'vd_source', 'from_spmid', 'referfrom', 'bilifrom', 'share_source',
			'share_medium', 'share_plat', 'share_session_id', 'share_tag', 'share_times', 'timestamp', 'bbid',
			'from_source', 'broadcast_type', 'is_room_feed', 'msource', 'noTitleBar', 'hasBack', 'jumpLinkType',
			'timestamp', 'unique_k', 'goFrom', 'ftype', 'otype', 'ctype', 'share_from', 'is_story_h5', 'mid',
			'native.theme', 'night', 'a_id', 's_id', 'ts',
		],
		useless_youtube = ['feature', 'ab_channel'],
		url = new URL(link),
		{host, pathname, searchParams} = url;
	if (host.endsWith('bilibili.com')) {
		if (pathname === '/read/mobile' && searchParams.has('id')) {
			url.pathname = `/read/cv/${searchParams.get('id')}`;
		} else {
			for (const param of useless_bilibili) {
				searchParams.delete(param);
			}
			if (searchParams.get('p') === '1') {
				searchParams.delete('p');
			}
		}
	} else if (host.endsWith('youtube.com') && pathname === '/watch') {
		for (const param of useless_youtube) {
			searchParams.delete(param);
		}
	}
	return url.toString();
};

module.exports = {update, exturl, sort, broken, archive, shorten};
