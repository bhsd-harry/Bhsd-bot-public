/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('../lib/api'),
	Interface = require('../lib/interface'),
	{user, pin, url} = require('../config/user'),
	{exturl, sort} = require('../lib/exturl'),
	{runMode, save} = require('../lib/dev');

const api = new Api(user, pin, url),
	chat = new Interface();

(async () => {
	let mode = runMode('sort');
	if (mode === 'run') {
		mode = 'dry';
	} else if (mode === 'sort') {
		sort();
		return;
	}
	let run = new Date(),
		dry;
	try {
		({run, dry} = require('../config/abuse32'));
	} catch {}
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		if (!dry) {
			throw new Error('没有保存的dry run！');
		}
		const newtimestamps = await api.massEdit(null, mode, '自动修复http链接'),
			archived = require('../config/broken');
		await Promise.all([
			save('../config/broken.json', {...archived, ...newtimestamps}),
			save('../config/abuse32.json', {run: dry}), // 将上一次dry run转化为实际执行
		]);
		return;
	}
	const last = new Date(run),
		now = new Date().toISOString(),
		yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 30);
	const date = (last > yesterday ? last : yesterday).toISOString(), // 不追溯超过1个月
		pages = (await api.taggedRecentChanges('非https地址插入', date))
			.filter(({content}) => content.includes('http://'));
	const edits = pages.length > 0 ? await exturl(pages, chat) : [];
	await Promise.all([
		edits.length > 0 ? api.massEdit(edits, mode, '自动修复http链接') : null,
		save('../config/abuse32.json', mode === 'dry' && edits.length > 0 ? {run, dry: now} : {run: now}),
	]);
})();
