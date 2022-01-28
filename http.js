/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{exturl, sort} = require('./exturl.js'),
	{runMode, save} = require('./dev.js');

const api = new Api(user, pin, 'https://mzh.moegirl.org.cn'),
	{run, dry} = require('./moegirl.json'); // 一个是上一次实际执行的时间，一个是上一次dry run的时间

(async () => {
	const mode = runMode('sort');
	if (mode === 'sort') {
		sort();
		return;
	}
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode, '自动修复http链接');
		save('moegirl.json', {run: dry}); // 将上一次dry run转化为实际执行
		return;
	}
	const last = new Date(run),
		now = new Date().toISOString(),
		yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	const date = (last > yesterday ? last : yesterday).toISOString(), // 不追溯超过1天
		pages = (await api.taggedRecentChanges('非https地址插入', date))
		.filter(({content}) => content.includes('http://'));
	const edits = pages.length > 0 ? await exturl(pages) : [];
	if (edits.length > 0) {
		await api.massEdit(edits, mode, '自动修复http链接');
	}
	save('moegirl.json', mode === 'dry' && edits.length > 0 ? {run, dry: now} : {run: now});
})();