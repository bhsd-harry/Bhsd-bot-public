/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{exturl} = require('./exturl.js'),
	{runMode} = require('./dev.js');

const api = new Api(user, pin, 'https://zh.moegirl.org.cn');

(async () => {
	const mode = runMode();
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode, '自动修复http链接');
		return;
	}
	const date = new Date();
	date.setDate(date.getDate() - 1);
	const pages = (await api.taggedRecentChanges('非https地址插入', date.toISOString()))
		.filter(({content}) => content.includes('http://'));
	if (pages.length > 0) {
		const edits = await exturl(pages);
		await api.massEdit(edits, mode, '自动修复http链接');
	}
})();