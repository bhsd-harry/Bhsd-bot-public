/**
 * @Function: 提供一个标准函数，用于修复指定文本中的http链接
 */
'use strict';
const {promises} = require('fs'),
	{ping, save, error, info, urlRegex, parse, wayback} = require('./dev'),
	{regexSource} = require('../config/exturl'); // 仅手动更新

let {http, https} = require('../config/exturl'),
	flag;

const caution = /^(?:www\.typemoon\.com|www\.gov\.cn|moba\.163\.com)/,
	archived = require('../config/broken');

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
			.filter(url => url.includes('.') && !regexException.test(url)))]
			.map(url => {
				if (/^\W*(?:t\W*i\W*e\W*b\W*a|p\W*a\W*n)\W*\.\W*b\W*a\W*i\W*d\W*u\W*\.\W*c\W*o\W*m\//i.test(url)) {
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
	const edits = (await Promise.all(pages.map(async ({pageid, content, oldContent, urls, timestamp, curtimestamp}) => {
		let text = content.replace(
			/(?<=\/\/)\W*(t\W*i\W*e\W*b\W*a|p\W*a\W*n)\W*\.\W*b\W*a\W*i\W*d\W*u\W*\.\W*c\W*o\W*m\//ig,
			'$1.baidu.com/',
		);
		oldContent ||= content; // eslint-disable-line no-param-reassign
		urls.forEach(url => {
			if (text.includes(url)) {
				text = text.replaceAll(`http://${url}`, `https://${url}`);
			} else {
				error(`页面 ${pageid} 找不到链接 http://${url} ！`);
			}
		});
		const result = await broken({content: text, pageid, timestamp, curtimestamp}, chat),
			[, nBroken, nArchived] = result;
		[text] = result; // eslint-disable-line require-atomic-updates
		if (text === oldContent) {
			return null;
		}
		return [pageid, oldContent, text, timestamp, curtimestamp, nBroken, nArchived];
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
 * @property {string|page_parser} content
 * @property {number} pageid
 * @property {string} timestamp
 * @property {string} curtimestamp
 * @param {Page}
 * @param {?Interface} chat - 命令行交互对象
 * @param {?boolean} force - 是否总是检查
 * @returns {Promise<string>}
 */
const broken = async ({content, pageid, timestamp, curtimestamp}, chat, force) => {
	if (new Date(timestamp).getTime() < new Date(archived[pageid]).getTime()) { // 无该页面记录时总是false
		info(`页面 ${pageid} 自上次检查失效链接以来无变动。`);
		return [content.toString()];
	}
	const parsed = parse(content);
	if (!force && parsed.find_template(['Dead link', 'Deadlink', '死链', '死鏈', '失效链接', '失效鏈接'])) {
		info(`页面 ${pageid} 已标注失效链接。`);
		return [content.toString()];
	}
	let urls = [],
		deadUrls = [];
	parsed.each(undefined, token => {
		if (token.type === 'url') {
			if (!token.dead && /\/\/$/.test(token[0])) {
				token[0] = token[0].slice(0, -1);
			}
			(token.dead ? deadUrls : urls).push(token[0].replace(/^\/\//, 'https://'));
		} else if (token.type === 'transclusion' && token.name === 'Cite web') {
			const {parameters} = token;
			if (parameters['archive-url'] || parameters.archiveurl) {
				return;
			}
			(parameters['dead-url'] === 'yes' ? deadUrls : urls).push(parameters.url.replace(/^\/\//, 'https://'));
		}
	});
	urls = [...new Set(urls)];
	const responses = (await Promise.all(urls.map(url => ping(url, true))))
		.filter(([, code]) => code === 404).map(([url]) => url);
	if (!force && responses.length === 0) {
		archived[pageid] = curtimestamp; // eslint-disable-line require-atomic-updates
		await save('../config/broken-temp.json', archived);
		return [parsed.toString()];
	}
	deadUrls = [...new Set([...deadUrls, ...responses])];
	let nBroken = 0,
		nArchived = 0;
	await parsed.each(undefined, async (token, _, parent) => {
		const {type, dead, parameters, index_of} = token;
		if (type !== 'url' && (type !== 'transclusion' || token.name !== 'Cite web')) {
			return;
		}
		const link = (type === 'url' ? token[0] : parameters.url).replace(/^\/\//, 'https://');
		if (!deadUrls.includes(link)) {
			return;
		}
		if (type === 'transclusion' && parameters['dead-url'] !== 'yes') { // Template:Cite web
			const index = index_of['dead-url'];
			if (index !== undefined) {
				token[index][2] = 'yes';
			} else {
				token.push('dead-url=yes');
			}
		}
		const [archiveUrl, date, template] = await archive(link, chat);
		if (type === 'transclusion') { // Template:Cite web
			if (!archiveUrl) {
				return;
			}
			nArchived++;
			const {'archive-url': i, 'archive-date': j} = index_of;
			if (i !== undefined) {
				token[i][2] = archiveUrl; // eslint-disable-line require-atomic-updates
			} else {
				token.push(`archive-url=${archiveUrl}`);
			}
			if (j !== undefined) {
				token[j][2] = date; // eslint-disable-line require-atomic-updates
			} else {
				token.push(`archive-date=${date}`);
			}
			return;
		}
		if (template && dead) {
			dead.toString = () => '';
		}
		if (parent.type !== 'external_link') {
			if (template) {
				token[0] = template; // eslint-disable-line require-atomic-updates
				nArchived++;
			} else if (!dead) {
				token[0] += '{{失效链接}}';
				nBroken++;
			}
			return;
		}
		if (template) {
			parent.toString = function() {
				const [,, text = ''] = this;
				return `${text && `${text}：`}${template}`;
			};
			nArchived++;
		} else if (!dead) {
			const {toString} = parent;
			parent.toString = function() {
				return `${toString.call(this)}{{失效链接}}`;
			};
			nBroken++;
		}
	});
	archived[pageid] = curtimestamp; // eslint-disable-line require-atomic-updates
	await save('../config/broken-temp.json', archived);
	return [parsed.toString(), nBroken, nArchived];
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
 * @param {?Interface} chat - 命令行交互对象
 * @param {?boolean} retry - 是否是第二次尝试
 * @returns {[?string, ?string, ?string]}
 */
const archive = async (link, chat, retry) => {
	const response = await wayback(link);
	if (!response) {
		return [];
	}
	const [, date,, lang] = response;
	let [url,, htmlTitle = ''] = response,
		title;
	htmlTitle = htmlTitle.replaceAll('|', '{{!}}')
		.replace(/ - AcFun弹幕视频网 - 认真你就输啦 \(\?ω\?\)ノ- \( ゜- ゜\)つロ$/, '|website=AcFun弹幕视频网');
	if (chat) {
		chat.set(str => `可能的title：${str}\n请输入正确的标题或跳过：`);
		title = await chat.push(htmlTitle, {404: [`对应的存档网址：${url}\n请输入正确的存档网址：`]});
		if (Array.isArray(title)) {
			[url] = title;
			return retry || !url ? [] : archive({raw: link, url, timestamp: url.slice(28, 42)}, chat, true);
		}
	}
	title ||= htmlTitle;
	return [
		url,
		date,
		`{{Cite web|url=${link.raw ?? link}|${lang && lang !== 'zh'
			? `language=${lang}|script-title=${lang}:`
			: 'title='
		}${title}|archive-url=${url}|archive-date=${date}|dead-url=yes}}`,
	];
};

module.exports = {update, exturl, sort, broken, archive};
