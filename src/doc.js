'use strict';
const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{runMode} = require('../lib/dev'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const regex = /\/doc(?:$|\/)/;

const getCategories = root => root.getCategories().map(([cat]) => cat);

const insertCategory = root => {
	const noinclude = root.querySelectorAll('noinclude')
		.find(token => /<\/noinclude(?:\s[^>]*)?>/i.test(token.toString()));
	if (noinclude) {
		noinclude.before('[[分类:模板文档]]');
	} else {
		root.appendChild('<noinclude>[[分类:模板文档]]</noinclude>');
	}
};

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode('includeonly');
	if (!module.parent) {
		await api[mode.endsWith('dry') ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动维护模板文档分类');
			return;
		}
	}

	if (mode === 'includeonly') {
		const pages = (await api.search(
				'intitle:doc -intitle:sandbox -intitle:沙盒 -insource:includeonly',
				{gsrnamespace: 10},
			)).filter(({title}) => regex.test(title)),
			edits = pages.map(({pageid, content, timestamp, curtimestamp}) => {
				const includeCats = getCategories(Parser.parse(content, true, 6));
				if (includeCats.length) {
					const root = Parser.parse(content, false, 6),
						noincludeCats = getCategories(root),
						repeatedCats = noincludeCats.filter(cat => includeCats.includes(cat));
					if (repeatedCats.length) {
						for (const cat of repeatedCats) {
							const token = root.querySelector(`category#${cat}`),
								tag = cat === 'Category:模板文档' ? 'noinclude' : 'includeonly';
							token.before(`<${tag}>`);
							token.after(`</${tag}>`);
						}
						if (!noincludeCats.includes('Category:模板文档')) {
							insertCategory(root);
						}
						return [
							pageid, content, root.toString().replaceAll('</includeonly><includeonly>', ''),
							timestamp, curtimestamp,
						];
					}
				}
				return null;
			}).filter(edit => edit);
		await api.massEdit(edits, 'dry', '自动维护模板文档分类');
		return;
	}

	const pages = await api.search(
			'intitle:doc -intitle:sandbox -intitle:沙盒 -incategory:模板文档',
			{gsrnamespace: 10, prop: 'categories|revisions', cllimit: 'max', clshow: '!hidden'},
		),
		uncat = pages.filter(({title, categories}) => !categories && regex.test(title)),
		edits = uncat.map(({pageid, content, timestamp, curtimestamp}) => {
			const root = Parser.parse(content, false, 1);
			if (root.querySelector('template#Template:即将删除, template#Template:即將刪除')) {
				return null;
			}
			insertCategory(root);
			return [pageid, content, root.toString(), timestamp, curtimestamp];
		}).filter(edit => edit);
	await api.massEdit(edits, mode, '自动维护模板文档分类');
};

if (!module.parent) {
	main();
}

module.exports = main;
