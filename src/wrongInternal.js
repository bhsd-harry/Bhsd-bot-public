'use strict';
const Api = require('../lib/api'),
	{runMode, save, urlRegex} = require('../lib/dev'),
	WikiUrl = require('../lib/url'),
	{user, pin, url} = require('../config/user'),
	{run, dry} = require('../config/abuse15'); // 一个是上一次实际执行的时间，一个是上一次dry run的时间

const protectedPages = [
	923, 100877, 110168, 177974, 261864, 359506, 364986, 401150, 404396, 424973, 428291, 438304, 450196, 453450,
	464940, 479074,
];

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await Promise.all([
				api.massEdit(null, mode, '自动修复误写作外链的内链'),
				save('../config/abuse15.json', {run: dry}), // 将上一次dry run转化为实际执行
			]);
			return;
		}
	}

	// 1. 先获取页面
	const last = new Date(run),
		now = new Date().toISOString(),
		yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 30);
	const date = (last > yesterday ? last : yesterday).toISOString(), // 不追溯超过1个月
		queries = await Promise.all([
			api.taggedRecentChanges('内外链误写', date),
			api.search('insource:"zh.moegirl.org.cn"', {gsrnamespace: '0|10|14'}),
			api.search('insource:"commons.moegirl.org.cn"', {gsrnamespace: '0|10|14'}),
		]),
		pageids = queries[1].map(({pageid}) => pageid);
	queries[0] = queries[0].filter(({pageid}) => !pageids.includes(pageid));
	const pages = queries.flat().filter(({pageid}) => !protectedPages.includes(pageid));

	// 2. 再进行修复
	const wikiUrl = new WikiUrl({
			'zh.moegirl.org.cn': '',
			'mzh.moegirl.org.cn': '',
			'commons.moegirl.org.cn': 'cm:',
		}, '/'),
		regex = new RegExp(`\\[{2}((?:https?:)?//${urlRegex}+)(.*?)]{1,2}`, 'gi'),
		edits = pages.map(({content, pageid, timestamp, curtimestamp}) =>
			[pageid, content, wikiUrl.replace(content.replace(regex, (_, p1, p2) => {
				return `[${p1}${p2.replace(/^\s*\|/, p => p.length === 1 ? ' ' : p.slice(0, -1))}]`;
			}), pageid), timestamp, curtimestamp],
		).filter(page => page).filter(([, content, text]) => content !== text);
	await Promise.all([
		edits.length > 0 ? api.massEdit(edits, mode, '自动修复误写作外链的内链') : null,
		save('../config/abuse15.json', mode === 'dry' && edits.length > 0 ? {run, dry: now} : {run: now}),
	]);
};

if (!module.parent) {
	main();
}

module.exports = main;
