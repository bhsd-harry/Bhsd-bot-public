'use strict';
const {promises} = require('fs'),
	Api = require('../lib/api'),
	Parser = require('../../wikiparser-node'),
	{runMode, info, save} = require('../lib/dev'),
	{broken} = require('../lib/exturl'),
	Interface = require('../lib/interface'),
	{user, pin, url} = require('../config/user');

(async () => {
	const mode = runMode('redry'),
		[,,, titles] = process.argv,
		api = new Api(user, pin, url),
		chat = new Interface();
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动添加网页存档或标记失效链接');
		return;
	}
	let pages, c;
	if (titles) {
		pages = await api.revisions({titles});
	} else {
		const response = await api.categorymembers('带有失效链接的条目', require('../config/archive'), 5);
		[pages, c] = response;
		[pages] = response;
	}
	const edits = (await Promise.all(pages.map(async ({content, pageid, timestamp, curtimestamp}) => {
		const parsed = Parser.parse(content, false, 9),
			selectors = ['Dead link', 'Deadlink', '死链', '死鏈', '失效链接', '失效鏈接']
				.map(name => `template#Template:${name}`).join();
		for (const token of parsed.querySelectorAll(selectors)) {
			const {previousElementSibling} = token;
			if (previousElementSibling?.type === 'free-extlink') {
				previousElementSibling.dead = token;
			} else if (previousElementSibling.type === 'ext-link') {
				previousElementSibling.firstChild.dead = token;
			}
		}
		const [text, nBroken, nArchived] = await broken({
			content: parsed, pageid, timestamp, curtimestamp,
		}, chat, true);
		return text === content ? null : [pageid, content, text, timestamp, curtimestamp, nBroken, nArchived];
	}))).filter(page => page);
	info(c ? `下次检查从 ${c.gcmcontinue} 开始。` : '已检查完毕！');
	try {
		const temp = require('../config/broken-temp');
		await Promise.all([
			c ? save('../config/archive.json', c) : null,
			save('../config/broken.json', temp),
			promises.unlink('../config/broken-temp.json'),
		]);
	} catch {}
	await api.massEdit(edits, mode, '自动添加网页存档或标记失效链接');
})();
