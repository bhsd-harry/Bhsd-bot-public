'use strict';

const Api = require('../lib/api'),
	{runMode, save} = require('../lib/dev'),
	{user, pin, url} = require('../config/user');

const skip = new Set([535_567]),
	pageids = [];

const main = async (api = new Api(user, pin, url, true)) => {
	const mode = runMode();
	let run = new Date(),
		dry;
	try {
		({dry, run} = require('../config/abuse8'));
	} catch {}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		if (!dry) {
			throw new Error('没有保存的dry run！');
		}
		await api.massEdit(null, mode, '自动修复不匹配的方括号');
		save('../config/abuse8.json', {run: dry}); // 将上一次dry run转化为实际执行
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
	for (const {pageid, content, timestamp, curtimestamp, missing} of pages) {
		if (missing || skip.has(pageid)) {
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
	if (edits.length > 0) {
		await api.massEdit(edits, mode, '自动修复不匹配的方括号');
	}
	if (pageids.length === 0) {
		save('../config/abuse8.json', mode === 'dry' && edits.length > 0 ? {run, dry: now} : {run: now});
	}
};

if (!module.parent) {
	main();
}

module.exports = main;
