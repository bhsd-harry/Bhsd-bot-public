'use strict';
const Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user');

(async () => {
	const api = new Api(user, pin, url),
		mode = runMode(),
		[,,, mistake = 403] = process.argv,
		mistakes = {
			403: '-403 - 访问权限不足',
			62003: '62003 - 稿件已审核通过，等待发布中',
		};
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode);
		return;
	}
	const {query: {usercontribs}} = await api.get({
		list: 'usercontribs', uclimit: 'max', ucuser: 'AnnAngela-abot', ucnamespace: 0, ucprop: 'ids|comment',
		uctag: '发现失效视频',
	});
	const uc = usercontribs
			.filter(({comment}) => new RegExp(String.raw`^发现失效视频：(?:\w+: ${mistakes[mistake]}、?)+$`).test(comment)),
		pageids = uc.map(({pageid}) => pageid);
	const pages = await api.revisions({
		pageids, prop: 'categories|revisions', cllimit: 'max',
		clcategories: 'Category:带有失效视频的条目|Category:带有受限视频的条目',
	});
	const edits = pages.filter(({categories}) =>
		categories && categories.some(({title}) => title === 'Category:带有失效视频的条目'),
	).map(({pageid, content, timestamp, curtimestamp, categories}) =>
		[
			pageid, content,
			content.replace(/\n\[\[Category:带有失效视频的条目\]\]/g, '')
				+ (mistake === 403 && categories.length === 1 ? '\n[[Category:带有受限视频的条目]]' : ''),
			timestamp, curtimestamp,
		],
	);
	await api.massEdit(edits, mode);
})();
