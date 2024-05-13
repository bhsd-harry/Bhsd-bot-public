/** @file 用于修复引自bilibili的图片 */
'use strict';
const Api = require('../lib/api'),
	Parser = require('wikiparser-node'),
	{user, pin, url} = require('../config/user'),
	{runMode, urlRegex} = require('../lib/dev');
Parser.warning = false;
Parser.config = './config/moegirl';

const regexHttps = new RegExp(
	`https://(?:i\\d\\.hdslb\\.com|w[wx]\\d\\.sinaimg\\.cn)/${urlRegex}+\\.(?:jpe?g|png|gif|tiff|bmp)(?!${urlRegex})`,
	'gi',
);
const regexHttp = new RegExp(
	`http://(?:i\\d\\.hdslb\\.com|w[wx]\\d\\.sinaimg\\.cn)/${urlRegex}+\\.(?:jpe?g|png|gif|tiff|bmp)(?!${urlRegex})`,
	'gi',
);
const testRegex = new RegExp(regexHttp, 'i');
const norefererTemplates = [
	'NoReferer', 'Producer_Song', 'Producer_Music', 'VOCALOID_&_UTAU_Ranking', 'VOCALOID_Ranking', 'WUGTop',
].map(str => `template#Template\\:${str}`).join();

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode('noreferer');
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复引自bilibili或新浪的图片外链');
			return;
		}
	}

	const _searchHttps = site => api.search(`insource:"https://${site}"`, {
			gsrnamespace: '0|9|10|11|12|13|14|15|275|829',
		}),
		_searchHttp = site => api.search(`insource:"http://${site}" !hastemplate:"noReferer"`, {
			gsrnamespace: '0|9|10|11|12|13|14|15|275|829',
		}),
		_insert = /** @param parsed {Parser.Token} */ parsed => {
			const token = parsed.sections()
				.find(section => testRegex.test(section.extractContents().map(ele => ele.text()).join('')))?.[0];
			if (token === undefined) {
				//
			} else if (token.type !== 'text' && token.matches(':header')) {
				token.after('\n{{noReferer}}');
			} else {
				parsed.prepend('{{noReferer}}\n');
			}
		};

	const _search = mode === 'noreferer' ? _searchHttp : _searchHttps,
		regex = mode === 'noreferer' ? regexHttp : regexHttps;
	// i[0-2].hdslb.com或ww[1-4].sinaimg.cn
	const pages = (await Promise.all([
		...new Array(3).fill().map((_, i) => _search(`i${i}.hdslb.com`)),

		// ...new Array(4).fill().map((_, i) => _search(`ww${i + 1}.sinaimg.cn`)),

		// ...new Array(4).fill().map((_, i) => _search(`wx${i + 1}.sinaimg.cn`)),
	])).flat();
	const pageids = [...new Set(pages.map(({pageid}) => pageid))],
		edits = pageids.map(pageid => pages.find(({pageid: id}) => id === pageid))
			.map(({pageid, content, timestamp, curtimestamp}) => {
				const urls = content.match(regex);
				if (!urls) {
					// error(`页面 ${pageid} 找不到图片链接！`);
					return null;
				}
				let text = content;
				if (mode !== 'noreferer') {
					for (const imgUrl of urls) {
						text = text.replace(imgUrl, `http://${imgUrl.slice(8)}`);
					}
				}
				const parsed = Parser.parse(text, false, 2);
				if (!parsed.querySelector(norefererTemplates)) {
					_insert(parsed);
				} else if (mode === 'noreferer') {
					return null;
				}
				return [pageid, content, parsed.toString(), timestamp, curtimestamp];
			}).filter(edit => edit && edit[1] !== edit[2]);
	await api.massEdit(edits, mode === 'noreferer' ? 'dry' : mode, mode === 'noreferer'
		? '自动添加{{[[template:noReferer|noReferer]]}}模板'
		: '自动修复引自bilibili或新浪的图片外链',
	);
};

if (!module.parent) {
	main();
}

module.exports = main;
