/**
 * @Function: 用于修复形如http://http://或类似的错误URL
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{error, runMode} = require('./dev.js'),
	{exturl} = require('./exturl.js');

const api = new Api(user, pin, 'https://mzh.moegirl.org.cn'),
	regex = /https?:\/{0,2}https?:\/{0,2}/g;

(async () => {
	const mode = runMode();
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode, '自动修复错误格式的外链');
		return;
	}
	const pages = (await Promise.all([
		api.search('insource:"https://http"'),
		api.search('insource:"http://http"')
	])).flat();
	const pageids = [...new Set(pages.map(({pageid}) => pageid))],
		pageSet = pageids.map(pageid => pages.find(({pageid: id}) => id === pageid));
	pageSet.forEach(page => {
		const {pageid, content} = page;
		if (!regex.test(content)) {
			error(`页面 ${pageid} 找不到错误URL！`);
			return;
		}
		page.oldContent = content;
		page.content = content.replace(regex, 'http://');
	});
	const edits = await exturl(pageSet);
	api.massEdit(edits, mode, '自动修复错误格式的外链');
})();