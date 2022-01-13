/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{info, save} = require('./dev.js'),
	{exturl} = require('./exturl.js'),
	params = require('./extLink.json'),
	{euquery} = params;

const api = new Api(user, pin, 'https://zh.moegirl.org.cn'),
	[,, mode] = process.argv;

(async () => {
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		const c = require('./euoffset.json');
		await api.massEdit(null, mode, '自动修复http链接');
		save('extLink.json', {euquery, ...c});
		return;
	}
	const [pages, c] = await api.extSearch({...params, geuquery: euquery});
	if (pages.length > 0) { // 否则直接跳过，记录euoffset
		const edits = await exturl(pages);
		await api.massEdit(edits, mode, '自动修复http链接');
	}
	if (mode === 'dry') {
		save('euoffset.json', c);
		info(c ? `下次检查从 ${c.euoffset} 开始。` : '已全部检查完毕！');
	} else {
		save('extLink.json', {euquery, ...c});
	}
})();