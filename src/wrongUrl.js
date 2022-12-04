/**
 * @Function: 用于修复形如http://http://或类似的错误URL
 */
'use strict';
const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{error, runMode} = require('../lib/dev');

const testRegex = /https?:?\/{0,2}https?:\/{0,2}/, // 用于test时不能有g修饰符
	replaceRegex = new RegExp(testRegex, 'g');

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复错误格式的外链');
			return;
		}
	}

	const params = {gsrnamespace: '0|2|3|9|10|11|12|13|14|15|275|829'},
		pages = (await Promise.all([
			api.search('insource:"https://http"', params),
			api.search('insource:"http://http"', params),
		])).flat(),
		edits = [...new Set(pages.map(({pageid}) => pageid))].map(pageid => {
			const {content, timestamp, curtimestamp} = pages.find(({pageid: id}) => id === pageid);
			if (!testRegex.test(content)) {
				error(`页面 ${pageid} 找不到错误URL！`);
				return false;
			}
			const text = content.replace(replaceRegex, 'http://');
			return text !== content && [pageid, content, text, timestamp, curtimestamp];
		}).filter(edit => edit);
	await api.massEdit(edits, mode, '自动修复错误格式的外链');
};

if (!module.parent) {
	main();
}

module.exports = main;
