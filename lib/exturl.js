/** @file 提供一个标准函数，用于修复指定文本中的http链接 */
'use strict';
const fs = require('fs'),
	Parser = require('wikiparser-node'),
	{ping, save, error, info, urlRegex, wayback} = require('./dev'),
	{regexSource} = require('../config/exturl'); // 仅手动更新
Parser.config = './config/moegirl';

let {http, https} = require('../config/exturl');
let flag;

/* eslint-disable no-underscore-dangle */
const _save = () => save('../../Bhsd-bot-public/config/exturl.json', {http, https, regexSource});

/** @param {string} url */
const _format = url => url.replace(/:\d+$/u, '').split('.').reverse()
	.join('.');

/**
 * @param {string} a
 * @param {string} b
 */
const _sort = (a, b) => _format(a) < _format(b) ? -1 : 1;

/** @param {string[]} names */
const _templates = names => names.map(name => String.raw`template#Template\:${name}`).join();
/* eslint-enable no-underscore-dangle */

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
		...https,
		...redirected,
		...responses.filter(({status}) => status === 'fulfilled').map(({value}) => value.slice(8)),
	];
	http = [
		...http,
		...unredirected,
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
const exturl = async (pages, chat) => {
	const caution = /^(?:w{3}\.typemoon\.com|moba\.163\.com)/u,
		regex = new RegExp(`(?<=[^/]http://)${urlRegex}+`, 'gu'),
		// eslint-disable-next-line require-unicode-regexp
		regexException = new RegExp(`^(?:${regexSource.join('|')})`, 'i');
	for (const page of pages) {
		page.urls = [
			...new Set((page.content.match(regex) || [])
				.filter(url => url.includes('.') && !regexException.test(url))),
		].map(url => {
			if (/^\W*(?:t\W*i\W*e\W*b\W*a|p\W*a\W*n)[^\w.]*\.\W*b\W*a\W*i\W*d\W*u[^\w.]*\.\W*c\W*o\W*m\//iu.test(url)) {
				const pieces = url.split('/');
				return `${pieces[0].replace(/[^\w.]/gu, '')}/${pieces.slice(1).join('/')}`;
			} else if (/^https?:/iu.test(url)) {
				error(`页面 ${page.pageid} 发现错误URL：http://${url}`);
			}
			return url;
		});
		page.domains = [
			...new Set([
				...page.urls.filter(url => caution.test(url)),
				...page.urls.filter(url => !caution.test(url)).map(url => url.split('/', 1)[0]),
			].map(domain => domain.toLowerCase())),
		];
		const wrongDomains = page.domains.filter(domain => domain.includes('*'));
		if (wrongDomains.length > 0) {
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
		_save();
	}
	const edits = (await Promise.all(
		pages.map(async ({pageid, title, content, oldContent, urls, timestamp, curtimestamp}) => {
			let text = content.replace(
				/(?<=\/\/)(?:[^\w/]\W*)?t\W*i\W*e\W*b\W*a[^\w.]*\.\W*b\W*a\W*i\W*d\W*u[^\w.]*\.\W*c\W*o\W*m\//giu,
				'tieba.baidu.com/',
			).replace(/(?<=\/\/)(?:[^\w/]\W*)?p\W*a\W*n[^\w.]*\.\W*b\W*a\W*i\W*d\W*u[^\w.]*\.\W*c\W*o\W*m\//giu, '');
			oldContent ||= content;
			for (const url of urls) {
				if (text.includes(url)) {
					text = text.replaceAll(`http://${url}`, `https://${url}`);
				} else {
					error(`页面 ${pageid} 找不到链接 http://${url} ！`);
				}
			}
			const result = await broken({content: text, pageid, title, timestamp, curtimestamp}, chat),
				[, nBroken, nArchived, nFailed] = result;
			[text] = result;
			if (text === oldContent) {
				return null;
			}
			return [pageid, oldContent, text, timestamp, curtimestamp, nBroken, nArchived, nFailed];
		}),
	)).filter(Boolean);
	try {
		/* eslint-disable n/no-missing-require */
		delete require.cache[require.resolve('../config/broken-temp')];
		const temp = require('../config/broken-temp');
		/* eslint-enable n/no-missing-require */
		save('../config/broken.json', temp);
		fs.unlinkSync('../config/broken-temp.json');
	} catch {}
	return edits;
};

const symbolMain = Symbol('main'),
	symbolDead = Symbol('dead'),
	symbolUrl = Symbol('url'),
	symbolLang = Symbol('lang');

/**
 * 标注失效链接
 * @typedef {object} Page
 * @property {string|Parser.Token} content
 * @property {number} pageid
 * @property {string} timestamp
 * @property {string} curtimestamp
 * @param {Page}
 * @param {?Interface} chat - 命令行交互对象
 * @param {?boolean} force - 是否总是检查
 * @param {?import('./api')} api
 * @returns {Promise<string>}
 */
const broken = async ({content, pageid, title, timestamp, curtimestamp}, chat, force, api) => {
	let archived = {},
		noChange = false;
	try {
		archived = require('../config/broken');
	} catch {}
	if (new Date(timestamp).getTime() <= new Date(archived[pageid]).getTime()) { // 无该页面记录时总是false
		info(`页面 ${pageid} 自上次检查失效链接以来无变动。`);
		noChange = true;
	}
	const /** @type {Parser.Token} */ parsed = typeof content === 'string'
			? Parser.parse(content, title, false, 9)
			: content,
		selectors = _templates(['Dead_link', 'Deadlink', '死链', '死鏈', '失效链接', '失效鏈接']),
		/** @type {Set<Parser.TranscludeToken>} */ deadLinks = new Set(parsed.querySelectorAll(selectors)),
		selectorsLang = _templates(['Ja', 'En']);
	if (!force && deadLinks.size > 0) {
		info(`页面 ${pageid} 已标注失效链接。`);
		return [String(content)];
	}
	for (const deadLink of deadLinks) {
		if (deadLink.hasArg('bot')) {
			deadLinks.delete(deadLink);
		}
	}
	let urls = [],
		deadUrls = [];
	/** @type {Parser.MagicLinkToken[]} */
	const magicLinks = parsed.querySelectorAll('ext-link-url,free-ext-link');
	for (const token of magicLinks) {
		if (token.type === 'free-ext-link' && token.isParamValue()) {
			continue;
		}
		token[symbolMain] = token.type === 'free-ext-link' ? token : token.parentNode;
		const {previousElementSibling, nextElementSibling} = token[symbolMain];
		token[symbolDead] = nextElementSibling?.matches(selectors) ? nextElementSibling : undefined;
		deadLinks.delete(nextElementSibling);
		if (previousElementSibling?.matches(selectorsLang)) {
			token[symbolLang] = previousElementSibling;
		} else if (nextElementSibling?.matches(selectorsLang)) {
			token[symbolLang] = nextElementSibling;
		}
		if (!token[symbolDead] && token.text().endsWith('//')) {
			token.setText(token.text().slice(0, -1));
		}
		if (!token[symbolDead]?.hasArg('bot')) {
			token[symbolUrl] = token.text().replace(/^\/\//u, 'https://');
			(token[symbolDead] ? deadUrls : urls).push(token[symbolUrl]);
		}
	}
	const citations = parsed.querySelectorAll(_templates(['Cite_web', 'Cite_news']));
	for (const token of citations) {
		const {nextElementSibling} = token;
		if (nextElementSibling?.matches(selectors)) {
			token[symbolDead] = nextElementSibling;
			deadLinks.delete(nextElementSibling);
			token.setValue('dead-url', 'yes');
		}
		if (token.getValue('archive-url') || token.getValue('archiveurl') || !token.getValue('url')) {
			token[symbolDead]?.remove();
			continue;
		}
		token[symbolMain] = token;
		if (!token[symbolDead]?.hasArg('bot')) {
			token[symbolUrl] = token.getValue('url').replace(/^\/\//u, 'https://');
			(token.getValue('dead-url') === 'yes' ? deadUrls : urls).push(token[symbolUrl]);
		}
	}
	const icls = parsed.querySelectorAll(_templates(['Icl', 'IconLink']));
	for (const token of icls) {
		const link = token.getValue('link') || token.getValue(2);
		if (link && /^(?:https?:)?\/\//u.test(link)) {
			const {nextElementSibling} = token;
			if (nextElementSibling?.matches(selectors)) {
				token[symbolDead] = nextElementSibling;
				deadLinks.delete(nextElementSibling);
			}
			token[symbolMain] = token;
			if (!token[symbolDead]?.hasArg('bot')) {
				token[symbolUrl] = link.replace(/^\/\//u, 'https://');
				(token[symbolDead] ? deadUrls : urls).push(token[symbolUrl]);
			}
		}
	}
	const bilis = parsed.querySelectorAll(_templates(['Bilibililink', 'Bililink', 'AcFunlink', 'Aclink']));
	for (const token of bilis) {
		const link = `${
				token.name.startsWith('Template:Bili')
					? 'https://www.bilibili.com/video'
					: 'https://www.acfun.cn/v'
			}/${token.getValue(1)}`,
			{nextElementSibling} = token;
		if (nextElementSibling?.matches(selectors)) {
			token[symbolDead] = nextElementSibling;
			deadLinks.delete(nextElementSibling);
		}
		token[symbolMain] = token;
		if (!token[symbolDead]?.hasArg('bot')) {
			token[symbolUrl] = link;
			(token[symbolDead] ? deadUrls : urls).push(link);
		}
	}
	const plains = parsed.querySelectorAll(_templates(['Plain_link']));
	for (const token of plains) {
		const /** @type {Parser.ExtLinkToken} */ ext = Parser.parse(
			`[${token.getValue(1) || token.getValue('URL') || token.getValue('url')}]`,
			title,
			false,
			8,
		).firstChild;
		if (ext.type === 'ext-link') {
			const {nextElementSibling} = token;
			if (nextElementSibling?.matches(selectors)) {
				token[symbolDead] = nextElementSibling;
				deadLinks.delete(nextElementSibling);
			}
			token[symbolMain] = token;
			if (!token[symbolDead]?.hasArg('bot')) {
				token[symbolUrl] = ext.firstChild.text().replace(/^\/\//u, 'https://');
				(token[symbolDead] ? deadUrls : urls).push(token[symbolUrl]);
			}
		}
	}
	// noChange = false;
	if (noChange) {
		for (const deadLink of deadLinks) {
			deadLink.remove();
		}
		await api?.massEdit([[pageid, content, String(parsed), timestamp, curtimestamp]], 'dry');
		return [String(content)];
	}
	urls = [...new Set(urls)].filter(url => !/https?:\/\/(?:apps|itunes)\.apple\.com\//u.test(url));
	const responses = (await Promise.allSettled(urls.map(url => ping(url, true))))
		.filter(({value}) => value?.[1] === 404).map(({value: [url]}) => url);
	if (!force && responses.length === 0) {
		archived[pageid] = curtimestamp;
		save('../config/broken-temp.json', archived);
		return [String(parsed)];
	}
	deadUrls = [...new Set([...deadUrls, ...responses])];
	let nBroken = 0,
		nArchived = 0,
		nFailed = 0;
	const tokens = parsed.querySelectorAll(
		`free-ext-link,ext-link-url,${
			_templates([
				'Cite_web',
				'Cite_news',
				'Icl',
				'IconLink',
				'Bilibililink',
				'Bililink',
				'AcFunlink',
				'Aclink',
				'Plain_link',
			])
		}`,
	).filter(
		token => !(
			token.type === 'free-ext-link' && (
				token.isParamValue()
				|| token.closest('parameter')?.name === '1'
				&& token.closest('template')?.name === 'Template:Plain_link'
			) || token.type === 'template' && !token[symbolMain]
		) && deadUrls.includes(token[symbolUrl]),
	);
	// 交互队列过长时，EventEmitter容易内存泄漏而出错
	if (tokens.length > 20) {
		error(`共有 ${tokens.length} 个失效链接待存档，本次仅检查前 20 个。`);
	}
	await Promise.all(tokens.slice(0, 20).map(async token => {
		const isTemplate = token.type === 'template'
			&& (token.name === 'Template:Cite_web' || token.name === 'Template:Cite_news');
		if (isTemplate && token.getValue('dead-url') !== 'yes') {
			token.setValue('dead-url', 'yes');
		}
		const [archiveUrl, date, template] = await archive(token[symbolUrl], chat, isTemplate);
		if (!template && !token[symbolDead]) {
			nBroken++;
			token[symbolMain].after('{{失效链接|bot=Bhsd-bot}}');
			// token[symbolMain].after('{{失效链接}}');
		} else if (template) {
			nArchived++;
			token[symbolDead]?.remove();
			token[symbolLang]?.remove();
			if (token[symbolLang] && isTemplate) {
				token.setValue('language', token[symbolLang].name.slice(9).toLowerCase());
			}
			if (isTemplate) {
				token.setValue('archive-url', archiveUrl);
				token.setValue('archive-date', date);
			} else {
				token[symbolMain].replaceWith(token.type === 'template' ? `<ref>${template}</ref>` : template);
			}
		} else {
			nFailed++;
			token[symbolDead].setValue('bot', 'Bhsd-bot');
		}
	}));
	archived[pageid] = curtimestamp;
	save('../config/broken-temp.json', archived);
	return [String(parsed), nBroken, nArchived, nFailed];
};

/** 给http和https列表排序 */
const sort = () => {
	http = http.sort(_sort);
	https = https.sort(_sort);
	_save();
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
	// return [];
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
		.replace(/ - AcFun弹幕视频网 - 认真你就输啦 \(\?ω\?\)ノ- \( ゜- ゜\)つロ$/u, '|website=AcFun弹幕视频网')
		.replace(/ - YouTube$/u, '|website=YouTube');
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
		return retry || !url
			? []
			: archive({raw: link, url, timestamp: url.slice(28, 42)}, chat, isTemplate, true);
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
	const uselessBilibili = [
			'from',
			'seid',
			'spm_id_from',
			'vd_source',
			'from_spmid',
			'referfrom',
			'bilifrom',
			'share_source',
			'share_medium',
			'share_plat',
			'share_session_id',
			'share_tag',
			'share_times',
			'timestamp',
			'bbid',
			'from_source',
			'broadcast_type',
			'is_room_feed',
			'msource',
			'noTitleBar',
			'hasBack',
			'jumpLinkType',
			'timestamp',
			'unique_k',
			'goFrom',
			'ftype',
			'otype',
			'ctype',
			'share_from',
			'is_story_h5',
			'mid',
			'native.theme',
			'night',
			'a_id',
			's_id',
			'ts',
		],
		uselessYoutube = ['feature', 'ab_channel'],
		url = new URL(link),
		{host, pathname, searchParams} = url;
	if (host.endsWith('bilibili.com')) {
		if (pathname === '/read/mobile' && searchParams.has('id')) {
			url.pathname = `/read/cv/${searchParams.get('id')}`;
		} else {
			for (const param of uselessBilibili) {
				searchParams.delete(param);
			}
			if (searchParams.get('p') === '1') {
				searchParams.delete('p');
			}
		}
	} else if (host.endsWith('youtube.com') && pathname === '/watch') {
		for (const param of uselessYoutube) {
			searchParams.delete(param);
		}
	}
	return url.toString();
};

module.exports = {update, exturl, sort, broken, archive, shorten};
