/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{exturl, sort} = require('../lib/exturl'),
	{runMode, save} = require('../lib/dev');

const {run, dry} = require('../config/moegirl'); // 一个是上一次实际执行的时间，一个是上一次dry run的时间

const main = async (api = new Api(user, pin, url)) => {
	const mode = module.parent ? 'dry' : runMode('sort');
	if (mode === 'sort') {
		sort();
		return;
	} else if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await Promise.all([
				api.massEdit(null, mode, '自动修复http链接'),
				save('../config/moegirl.json', {run: dry}), // 将上一次dry run转化为实际执行
			]);
			return;
		}
	}
	const last = new Date(run),
		now = new Date().toISOString(),
		yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	const date = (last > yesterday ? last : yesterday).toISOString(), // 不追溯超过1天
		pages = (await api.taggedRecentChanges('非https地址插入', date))
			.filter(({content}) => content.includes('http://'));
	const edits = pages.length > 0 ? await exturl(pages) : [];
	await Promise.all([
		edits.length > 0 ? api.massEdit(edits, mode, '自动修复http链接') : null,
		save('../config/moegirl.json', mode === 'dry' && edits.length > 0 ? {run, dry: now} : {run: now}),
	]);
};

if (!module.parent) {
	main();
}

module.exports = main;
