'use strict';
const Api = require('../lib/api'),
	{runMode, parse, info, save} = require('../lib/dev'),
	{broken} = require('../lib/exturl'),
	{user, pin, url} = require('../config/user');

(async () => {
	const mode = runMode('redry'),
		api = new Api(user, pin, url);
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动添加网页存档或标记失效链接');
		return;
	}
	const [pages, c] = await api.categorymembers('带有失效链接的条目', require('../config/archive'), 20);
	if (c === undefined) {
		info('已检查完毕！');
	} else {
		info(`下次检查从 ${c.gcmcontinue} 开始。`);
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
				sibling.dead = true;
			} else if (sibling.type === 'external_link') {
				sibling.find(({type}) => type === 'url').dead = true;
			}
		});
		const text = await broken(parsed, pageid, true);
		return text === content ? null : [pageid, content, text, timestamp, curtimestamp];
	}))).filter(page => page);
	await Promise.all([
		api.massEdit(edits, mode, '自动添加网页存档或标记失效链接'),
		save('../config/archive.json', c ?? {}),
	]);
})();
