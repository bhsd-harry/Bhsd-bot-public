'use strict';

const Api = require('../lib/api'),
	Parser = require('wikiparser-node'),
	{contentLength, info, error, save} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	api = new Api(user, pin, url);
Object.assign(Parser, {
	warning: false,
	internal: true,
});

const _generateSelector = titles => titles.map(str => String.raw`template#Template\:${str}`).join();

const names = ['背景图片', '背景圖片'],
	selector = _generateSelector(names),
	embedded = ['空洞骑士', '空洞騎士', 'Helltaker', '林中之夜'],
	embeddedSelector = _generateSelector(embedded),
	args = [
		'url', 'animate', 'position', 'action', 'displaylogo', 'color', 'style', 'make', 'shadecolor', 'shade',
		'logo-url', 'logo-position', 'logo-size',
	];

const _searchAll = async params => {
	const {query: {search}, continue: c} = await api.get({
		list: 'search', srlimit: 'max', srnamespace: 0, srinfo: '', srprop: 'snippet', ...params,
	});
	if (!c) {
		return search;
	}
	return [...search, ...await _searchAll({...params, ...c})];
};

const _analyze = page => {
	const snippet = 'snippet' in page
			? `${
				page.snippet.replace(/<span class="searchmatch">([^<]+)<\/span>/g, '$1')
					.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
			}bhsd-bot/bgimage.js}}}}}}`
			: page.content,
		parsed = Parser.parse(snippet, 2);
	if (parsed.has(embeddedSelector)) {
		page.imgUrl = false;
		return;
	}
	const template = parsed.descendants(selector).at(-1);
	if (!template) {
		return;
	}
	const imgUrl = template.getValue('url')?.trim()?.toLowerCase(),
		imgParam = template.getValue(1)?.trim()?.toLowerCase(),
		regex = /^\s*https?:\/\/(?!\w+\.moegirl\.org)/;
	if (imgUrl !== undefined && !imgUrl.endsWith('bhsd-bot/bgimage.js')) { // 情形1: 完整的url参数
		page.imgUrl = regex.test(imgUrl) ? imgUrl : false;
	} else if (imgUrl !== undefined) {
		const trueImgUrl = imgUrl.slice(0, -19);
		if (trueImgUrl.length < 7) { // 情形2: 截断的url参数，且长度小于完整协议
			page.imgUrl = 'http://'.startsWith(trueImgUrl) || 'https://'.startsWith(trueImgUrl) ? undefined : false;
			return;
		}
		// 情形3: 截断的url参数，且长度大于完整协议
		page.imgUrl = regex.test(trueImgUrl) ? undefined : false;
	} else if (imgParam !== undefined && !imgParam.endsWith('bhsd-bot/bgimage.js')) { // 情形1: 完整的匿名参数1
		page.imgUrl = regex.test(imgParam) ? imgParam : false;
	} else if (imgParam !== undefined) {
		const trueImgUrl = imgParam.slice(0, -19);
		if (args.some(arg => arg.startsWith(trueImgUrl.trim()))) { // 情形4: 截断的匿名参数1，且可能是个参数名
			page.imgUrl = false;
		} else if (trueImgUrl.length < 7) { // 情形2: 截断的匿名参数1，且长度小于完整协议
			page.imgUrl = 'http://'.startsWith(trueImgUrl) || 'https://'.startsWith(trueImgUrl) ? undefined : false;
			return;
		}
		// 情形3: 截断的匿名参数1，且长度大于完整协议
		page.imgUrl = regex.test(trueImgUrl) ? undefined : false;
	} else if (!template.text().endsWith('bhsd-bot/bgimage.js}}')) { // 情形5: 完整模板中同时缺失url参数和匿名参数1
		page.imgUrl = false;
	}
	// 情形6: 截断的匿名参数1，或不完整的模板中同时缺失url参数和匿名参数1
};

(async () => {
	await api.login();
	let pages = [];
	for (const str of [...new Set(names.map(s => s.toLowerCase()))]) {
		pages.push(await _searchAll({srsearch: `hastemplate:"背景图片" insource:"${str}"`}));
	}
	pages = [...new Set(pages)];
	pages.forEach(_analyze);
	const unknown = pages.filter(({imgUrl}) => imgUrl === undefined),
		unknownPages = await api.revisions({pageids: unknown.map(({pageid}) => pageid)});
	unknownPages.forEach(_analyze);
	let known = {};
	try {
		known = require('../config/bgimage');
	} catch {}
	const exPages = [...pages, ...unknownPages].filter(({imgUrl}) => imgUrl),
		exImage = [...new Set(exPages.map(({imgUrl}) => imgUrl))],
		responses = (await Promise.allSettled(exImage.map(async imgUrl => {
			const path = imgUrl.replace(/^https?:\/\//i, '').toLowerCase();
			if (!(path in known)) {
				known[path] = await contentLength(imgUrl);
			}
			return known[path];
		}))).map((response, i) => ({
			...response, imgUrl: exImage[i], relatedPages: exPages.filter(({imgUrl}) => imgUrl === exImage[i]),
		}));
	await save('../config/bgimage.json', known);
	const unknownImage = responses.filter(({status, value}) => status !== 'fulfilled' || value === null)
			.map(({imgUrl, relatedPages}) => ({imgUrl, relatedPages: relatedPages.map(({pageid}) => pageid)})),
		bigImage = responses.filter(({status, value}) => status === 'fulfilled' && value > 2 * 1024 ** 2)
			.flatMap(({relatedPages}) => relatedPages.map(({pageid}) => pageid));
	info('过大的背景图片所在页面：');
	console.log(bigImage);
	error('未知大小的背景图片及其所在页面：');
	console.log(unknownImage);
})();
