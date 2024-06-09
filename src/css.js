'use strict';
const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{runMode, info} = require('../lib/dev'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const addCategory = async (api, mode, allPages = []) => {
	const pages = allPages.filter(({categories}) => !categories);
	if (mode !== 'dry') {
		for (const {pageid, ns} of pages) {
			await api.edit({
				pageid,
				appendtext: `\n/* [[分类:在${ns === 0 ? '主' : '模板'}名字空间下的CSS页面]] */`,
				summary: '自动维护模板样式表分类',
			});
		}
	} else if (pages.length > 0) {
		info('待添加分类的CSS页面：');
		for (const {title} of pages) {
			console.log(title);
		}
	}
};

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode.endsWith('dry') ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动维护使用模板样式表的模板分类');
			return;
		}
	}
	const {query} = await api.get({
		generator: 'search',
		gsrlimit: 500,
		gsrnamespace: '0|10',
		prop: 'categories',
		cllimit: 'max',
		gsrsearch: 'contentmodel:"sanitized-css" -intitle:sandbox -intitle:沙盒'
		+ ' -incategory:在模板名字空间下的CSS页面 -incategory:在主名字空间下的CSS页面'
		+ ' -incategory:偶像大师模板CSS -incategory:"赛马娘 Pretty Derby模板CSS"',
		clcategories: 'Category:在模板名字空间下的CSS页面|Category:在主名字空间下的CSS页面'
		+ '|Category:偶像大师模板CSS|Category:赛马娘 Pretty Derby模板CSS',
	});
	let pages = query?.pages;
	await addCategory(api, mode, pages);
	pages = (await api.search(
		'insource:"templatestyles src" -intitle:sandbox -intitle:沙盒 -intitle:doc -incategory:使用模板样式的模板',
		{gsrnamespace: 10, prop: 'revisions|categories', cllimit: 'max', clcategories: 'Category:使用模板样式的模板'},
	)).filter(({categories}) => !categories);
	const edits = pages.map(({pageid, content, timestamp, curtimestamp}) => {
		const included = Parser.parse(content, true, 1);
		if (!included.querySelector('ext#templatestyles')) {
			return null;
		}
		const root = Parser.parse(content, false, 1),
			noinclude = root.querySelectorAll('noinclude')
				.find(token => /<\/noinclude(?:\s[^>]*)?>/iu.test(token.toString()));
		if (noinclude) {
			noinclude.before('[[分类:使用模板样式的模板]]');
		} else {
			root.append('<noinclude>[[分类:使用模板样式的模板]]</noinclude>');
		}
		return [pageid, content, root.toString(), timestamp, curtimestamp];
	}).filter(Boolean);
	await api.massEdit(edits, mode, '自动维护使用模板样式表的模板分类');
};

if (!module.parent) {
	main();
}

module.exports = main;
