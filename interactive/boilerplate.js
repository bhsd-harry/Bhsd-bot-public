'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode, save} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	/** @type {Record<string, string[]>} */ boilerplates = require('../config/boilerplate'),
	lintErrors = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

const update = content => {
	const root = Parser.parse(content, true, 1),
		/** @type {Parser.CommentToken[]} */
		comments = root.querySelectorAll('comment');
	return [
		...new Set(comments.map(({innerText}) => innerText)
			.filter(text => text !== '默认立绘' && !text.includes('保留这里的注释'))),
	];
};

const main = async (api = new Api(user, pin, url)) => {
	let mode = runMode('update');
	if (mode === 'run') {
		mode = 'dry';
	}
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message}) => message === '预加载残留',
	));
	if (mode !== 'update' && targets.length === 0) {
		return;
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' || mode === 'update' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动清理预加载残留');
		return;
	}
	const edits = [],
		residuals = new Set(Object.values(boilerplates).flat()),
		pages = await api.revisions(
			mode === 'update'
				? {
					generator: 'prefixsearch',
					gpssearch: 'Template:页面格式',
					gpsnamespace: 10,
					gpslimit: 'max',
				}
				: {pageids: targets.map(([pageid]) => pageid)},
		);
	for (const {title, pageid, ns, content, timestamp, curtimestamp} of pages) {
		if (mode === 'update') {
			if (title.startsWith('Template:页面格式/') && !title.endsWith('/doc')) {
				boilerplates[title] = update(content);
			}
			continue;
		}
		const root = Parser.parse(content, ns === 10, 1),
			/** @type {Parser.CommentToken[]} */
			comments = root.querySelectorAll('comment');
		for (const token of comments) {
			if (residuals.has(token.innerText)) {
				const {previousSibling, nextSibling} = token;
				token.remove();
				if (
					previousSibling?.type === 'text' && previousSibling.data.endsWith('\n')
					&& nextSibling?.type === 'text' && nextSibling.data.startsWith('\n')
				) {
					previousSibling.appendData(nextSibling.data.slice(1));
					nextSibling.remove();
				}
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	if (mode === 'update') {
		save('../config/boilerplate.json', boilerplates);
	} else {
		await api.massEdit(edits, mode, '自动清理预加载残留');
	}
};

if (!module.parent) {
	main();
}

module.exports = main;
module.exports.update = update;
