'use strict';
const {promises} = require('fs'),
	Api = require('../lib/api'),
	{runMode, info, save} = require('../lib/dev'),
	{broken} = require('../lib/exturl'),
	Interface = require('../lib/interface'),
	{user, pin, url} = require('../config/user');
const skip = [1546];

(async () => {
	const [,,, titles] = process.argv,
		api = new Api(user, pin, url, true),
		chat = new Interface();
	let mode = runMode('redry');
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'redry') {
		await api.massEdit(null, mode);
		return;
	} else if (mode === 'rerun') {
		const newtimestamps = await api.massEdit(null, mode, '自动添加网页存档或标记失效链接');
		const archived = require('../config/broken');
		await save('../config/broken.json', {...archived, ...newtimestamps});
		return;
	}
	let pages, c, archive;
	try {
		archive = require('../config/archive');
	} catch {}
	const incomplete = titles && isNaN(titles);
	if (incomplete) {
		pages = await api.revisions(
			titles.split('|').every(pageid => !isNaN(pageid)) ? {pageids: titles} : {titles},
		);
	} else {
		const response = await api.categorymembers('带有失效链接的条目', archive, Number(titles) || 5);
		[pages, c] = response;
		[pages] = response;
	}
	info(c ? `下次检查从 ${c.gcmcontinue} 开始。` : '已检查完毕！');
	const edits = (await Promise.all(pages.map(async ({content, pageid, timestamp, curtimestamp}) => {
		if (skip.includes(pageid)) {
			return false;
		}
		const [text, nBroken, nArchived, nFailed] = await broken({
			content, pageid, timestamp, curtimestamp,
		}, chat, true, api);
		return text !== content && [pageid, content, text, timestamp, curtimestamp, nBroken, nArchived, nFailed];
	}))).filter(Boolean);
	try {
		const temp = require('../config/broken-temp'); // eslint-disable-line n/no-missing-require
		await Promise.all([
			save('../config/broken.json', temp),
			promises.unlink('../config/broken-temp.json'),
		]);
	} catch {}
	await Promise.all([
		c ? save('../config/archive.json', c) : null,
		api.massEdit(edits, mode, '自动添加网页存档或标记失效链接'),
	]);
})();
