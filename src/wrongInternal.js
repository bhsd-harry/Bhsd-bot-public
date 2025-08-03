'use strict';
const Api = require('../lib/api'),
	{runMode, save, urlRegex} = require('../lib/dev'),
	WikiUrl = require('../lib/url'),
	lintErrors = require('../config/lintErrors'),
	{user, pin, url} = require('../config/user');

const protectedPages = [
	100_877,
	404_396,
	629_694,
];

const main = async (api = new Api(user, pin, url, true)) => {
	let mode = runMode('mzh'),
		run = new Date(),
		dry;
	try {
		({run, dry} = require('../config/abuse15'));
	} catch {}
	if (mode !== 'redry') {
		await api[mode === 'dry' || mode === 'mzh' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复误写作外链的内链');
		save('../config/abuse15.json', {run: dry}); // 将上一次dry run转化为实际执行
		return;
	}

	// 1. 先获取页面
	// const last = new Date(run);
	const now = new Date().toISOString(),
		yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 30);
	// const date = (last > yesterday ? last : yesterday).toISOString(); // 不追溯超过1个月
	const queries = await Promise.all(
		mode === 'mzh'
			? [api.search('insource:"mzh.moegirl.org.cn"', {gsrnamespace: '0|10|14'})]
			: [
				// api.taggedRecentChanges('内外链误写', date),
				// api.search('insource:"zh.moegirl.org.cn"', {gsrnamespace: '0|10|14'}),
				// api.search('insource:"commons.moegirl.org.cn"', {gsrnamespace: '0|10|14'}),
				api.revisions({
					pageids: Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
						({message}) => message === '误写作外链的内链',
					)).map(([pageid]) => pageid),
				}),
			],
	);
	// pageids = queries[1].map(({pageid}) => pageid);
	// queries[0] = queries[0].filter(({pageid}) => !pageids.includes(pageid));
	const pages = queries.flat().filter(({pageid}) => !protectedPages.includes(pageid));

	// 2. 再进行修复
	const wikiUrl = new WikiUrl(
		mode === 'mzh'
			? {'mzh.moegirl.org.cn': ''}
			: {
				'zh.moegirl.org.cn': '',
				'commons.moegirl.org.cn': 'cm:',
			},
		'/',
	);
	if (mode === 'mzh') {
		mode = 'dry';
	}
	const regex = new RegExp(String.raw`\[{2}((?:https?:)?//${urlRegex}+)(.*?)\]{1,2}`, 'giu'),
		edits = pages.map(
			({content, pageid, timestamp, curtimestamp}) =>
				[
					pageid,
					content,
					wikiUrl.replace(content.replace(
						regex,
						(_, p1, p2) => `[${p1}${p2.replace(/^\s*\|/u, p => p.length === 1 ? ' ' : p.slice(0, -1))}]`,
					), pageid),
					timestamp,
					curtimestamp,
				],
		).filter(Boolean).filter(([, content, text]) => content !== text);
	if (edits.length > 0) {
		await api.massEdit(edits, mode, '自动修复误写作外链的内链');
	}
	save('../config/abuse15.json', mode === 'dry' && edits.length > 0 ? {run, dry: now} : {run: now});
};

if (!module.parent) {
	main();
}

module.exports = main;
