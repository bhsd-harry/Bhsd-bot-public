'use strict';
const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{runMode, info} = require('../lib/dev'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const addCategory = async (api, mode, search = []) => {
	if (mode !== 'dry') {
		for (const {pageid, ns} of search) {
			await api.edit({ // eslint-disable-line no-await-in-loop
				pageid, appendtext: `\n/* [[分类:在${ns === 0 ? '主' : '模板'}名字空间下的CSS页面]] */`,
				summary: '自动维护模板样式表分类',
			});
		}
	} else if (search.length) {
		info('待添加分类的CSS页面：');
		for (const {title} of search) {
			console.log(title);
		}
	}
};

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode.endsWith('dry') ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, 'rerun', '自动维护使用模板样式表的模板分类');
			return;
		}
	}
	const {query: {search}} = await api.get({
		list: 'search', srlimit: 'max', srinfo: '', srprop: '', srnamespace: '0|10',
		srsearch: 'contentmodel:"sanitized-css" -intitle:sandbox -intitle:沙盒'
			+ ' -incategory:在模板名字空间下的CSS页面 -incategory:在主名字空间下的CSS页面'
			+ ' -incategory:偶像大师模板CSS -incategory:赛马娘 Pretty Derby模板CSS‎',
	});
	await addCategory(api, mode, search);
	const pages = await api.search(
			'insource:"templatestyles src" -intitle:sandbox -intitle:沙盒 -intitle:doc -incategory:使用模板样式的模板',
			{gsrnamespace: 10},
		),
		edits = pages.map(({pageid, content, timestamp, curtimestamp}) => {
			const included = Parser.parse(content, true, 1);
			if (!included.querySelector('ext#templatestyles')) {
				return null;
			}
			const root = Parser.parse(content, false, 1),
				noinclude = root.querySelectorAll('noinclude')
					.find(token => /<\/noinclude(?:\s+[^>]*)?>/i.test(token.toString()));
			if (noinclude) {
				noinclude.before('[[分类:使用模板样式的模板]]');
			} else {
				root.appendChild('<noinclude>[[分类:使用模板样式的模板]]</noinclude>');
			}
			return [pageid, content, root.toString(), timestamp, curtimestamp];
		}).filter(edit => edit);
	await api.massEdit(edits, mode, '自动维护使用模板样式表的模板分类');
};

if (!module.parent) {
	main();
}

module.exports = main;
