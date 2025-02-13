'use strict';

const Api = require('../lib/api'),
	{runMode, save} = require('../lib/dev'),
	{user, pin, url} = require('../config/user');

const skip = [535_567],
	pageids = [];

const main = async (api = new Api(user, pin, url, true)) => {
	const mode = runMode();
	let run = new Date(),
		dry;
	try {
		({dry, run} = require('../config/abuse8'));
	} catch {}
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		if (!dry) {
			throw new Error('没有保存的dry run！');
		}
		await Promise.all([
			api.massEdit(null, mode, '自动修复不匹配的方括号'),
			save('../config/abuse8.json', {run: dry}), // 将上一次dry run转化为实际执行
		]);
		return;
	}
	const last = new Date(run),
		now = new Date().toISOString(),
		yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 30);
	const date = (last > yesterday ? last : yesterday).toISOString(), // 不追溯超过1个月
		pages = await (
			pageids.length > 0 ? api.revisions({pageids}) : api.taggedRecentChanges('方括号不配对', date)
		);
	let edits = [];
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		if (skip.includes(pageid)) {
			continue;
		}
		edits.push([
			pageid,
			content,
			content.replace(/\[ (?=(?:https?:)?\/\/)/giu, '[')
				.replace(/(?<![[/])(https?:\/\/[^[\]]+\]|\[[^[\]]+\]\])(?!\])/giu, '[$1')
				.replace(/\[\[[^[\]]+\](?!\])/gu, '$&]')
				.replace(/\[(?:https?:)?\/\/[^\]]+(?=<\/ref\s*>)/giu, '$&]')
				.replace(/\[(?:https?:)?\/\/[^\]]+\]/giu, p => p.replaceAll('\n', ' ')),
			timestamp,
			curtimestamp,
		]);
	}
	edits = edits.filter(([, content, text]) => content !== text);
	await Promise.all([
		edits.length > 0 ? api.massEdit(edits, mode, '自动修复不匹配的方括号') : null,
		pageids.length > 0
			? null
			: save('../config/abuse8.json', mode === 'dry' && edits.length > 0 ? {run, dry: now} : {run: now}),
	]);
};

if (!module.parent) {
	main();
}

module.exports = main;
