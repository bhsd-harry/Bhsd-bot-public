/**
 * @Function: 用于修复引自bilibili的图片
 */
'use strict';
const Api = require('../lib/api'),
	Parser = require('../../wikiparser-node'),
	$ = Parser.getTool(),
	{user, pin, url} = require('../config/user'),
	{error, runMode, urlRegex} = require('../lib/dev');
Parser.warning = false;
Parser.config = './config/moegirl';

const regexHttps = new RegExp(
		`https://(?:i\\d\\.hdslb\\.com|w[wx]\\d\\.sinaimg\\.cn)/${urlRegex}+\\.(?:jpe?g|png|gif|tiff|bmp)`,
		'gi',
	),
	regexHttp = new RegExp(
		`http://(?:i\\d\\.hdslb\\.com|w[wx]\\d\\.sinaimg\\.cn)/${urlRegex}+\\.(?:jpe?g|png|gif|tiff|bmp)`,
		'gi',
	),
	norefererTemplates = ['NoReferer', 'Producer Song', 'Producer Music']
		.map(str => `template#Template:${str}`).join();

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode('noreferer');
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复引自bilibili或新浪的图片外链');
			return;
		}
	}

	const _searchHttps = site => api.search(`insource:"https://${site}"`),
		_searchHttp = site => api.search(`insource:"http://${site}"`),
		_insert = parsed => {
			const [token] = parsed.sections().find(section => regexHttp.test($(section).text())),
				{firstChild} = Parser.parse('{{noReferer}}', false, 2);
			regexHttp.lastIndex = 0;
			if (typeof token === 'object' && token.matches(':header')) {
				token.after('\n', firstChild);
			} else {
				parsed.prepend(firstChild, '\n');
			}
		};

	const _search = mode === 'noreferer' ? _searchHttp : _searchHttps,
		regex = mode === 'noreferer' ? regexHttp : regexHttps;
	// i[0-2].hdslb.com或ww[1-4].sinaimg.cn
	const pages = (await Promise.all([
		...new Array(3).fill().map((_, i) => _search(`i${i}.hdslb.com`)),
		...new Array(4).fill().map((_, i) => _search(`ww${i + 1}.sinaimg.cn`)),
		...new Array(4).fill().map((_, i) => _search(`wx${i + 1}.sinaimg.cn`)),
	])).flat();
	const pageids = [...new Set(pages.map(({pageid}) => pageid))],
		edits = pageids.map(pageid => pages.find(({pageid: id}) => id === pageid))
			.map(({pageid, content, timestamp, curtimestamp}) => {
				const urls = content.match(regex);
				if (!urls) {
					error(`页面 ${pageid} 找不到图片链接！`);
					return null;
				}
				let text = content;
				if (mode !== 'noreferer') {
					urls.forEach(imgUrl => {
						text = text.replace(imgUrl, `http://${imgUrl.slice(8)}`);
					});
				}
				const parsed = Parser.parse(text, false, 2);
				if (!parsed.querySelector(norefererTemplates)) {
					_insert(parsed);
				} else if (mode === 'noreferer') {
					return null;
				}
				return [pageid, content, parsed.toString(), timestamp, curtimestamp];
			}).filter(edit => edit);
	await api.massEdit(edits, mode === 'noreferer' ? 'dry' : mode, mode === 'noreferer'
		? '自动添加{{[[template:noReferer|noReferer]]}}模板'
		: '自动修复引自bilibili或新浪的图片外链',
	);
};

if (!module.parent) {
	main();
}

module.exports = main;
