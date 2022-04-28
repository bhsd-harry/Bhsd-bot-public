'use strict';
const Api = require('../lib/api'),
	{user, pin, url: apiUrl} = require('../config/user'),
	{error, runMode, save, info} = require('../lib/dev');

(async (api = new Api(user, pin, apiUrl)) => {
	const mode = runMode();
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode, '自动修复错误格式的bilibili视频分页链接');
		return;
	}

	const urlRegex = /\/index_\d+\.html$/,
		textRegex = /(www\.bilibili\.com\/video\/av\d+)\/index_(\d+)\.html/g;
	const {query: {exturlusage}, continue: c} = await api.get({
		list: 'exturlusage', eulimit: 'max', eunamespace: '0|10|12|14|828', euprotocol: 'https',
		euquery: 'www.bilibili.com/video/av', ...require('../config/bilibili'),
	});
	info(c === undefined ? '已全部检查完毕！' : `下次检查从 ${c.euoffset} 开始。`);
	const pageids = [...new Set(exturlusage.filter(({url}) => urlRegex.test(url)).map(({pageid}) => pageid))],
		pages = await api.revisions({pageids});
	const edits = pages.map(({pageid, content, timestamp, curtimestamp}) => {
		if (!textRegex.test(content)) {
			error(`页面 ${pageid} 找不到错误的bilibili视频分页链接！`);
			return null;
		}
		const text = content.replace(textRegex, '$1?p=$2');
		return [pageid, content, text, timestamp, curtimestamp];
	}).filter(page => page);
	await Promise.all([
		api.massEdit(edits, mode, '自动修复错误格式的bilibili视频分页链接'),
		save('../config/bilibili.json', c ?? {}),
	]);
})();
