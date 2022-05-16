'use strict';
const {promises} = require('fs'),
	Api = require('../lib/api'),
	{runMode, parse, info, save} = require('../lib/dev'),
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
		const parsed = parse(content);
		parsed.each('transclusion', (token, i, parent) => {
			if (i === 0 || !/[Dd]ead ?link|死[链鏈]|失效[链鏈]接/.test(token.name)) {
				return;
			}
			let sibling = parent[i - 1];
			if (i > 1 && typeof sibling === 'string' && !/\S/.test(sibling)) {
				sibling = parent[i - 2];
			}
			if (sibling.type === 'url') {
				sibling.dead = token;
			} else if (sibling.type === 'external_link') {
				sibling.find(({type}) => type === 'url').dead = token;
			}
		});
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
