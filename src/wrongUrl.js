/**
 * @Function: 用于修复形如http://http://或类似的错误URL
 */
'use strict';
const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{error, runMode} = require('../lib/dev'),
	{exturl} = require('../lib/exturl');

const regex = /https?:?\/{0,2}https?:\/{0,2}/g;

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复错误格式的外链');
			return;
		}
	}

	const params = {gsrnamespace: '0|2|3|9|10|11|12|13|14|15|275|829'};
	const pages = (await Promise.all([
		api.search('insource:"https://http"', params),
		api.search('insource:"http://http"', params),
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
	await api.massEdit(edits, mode, '自动修复错误格式的外链');
};

if (!module.parent) {
	main();
}

module.exports = main;
