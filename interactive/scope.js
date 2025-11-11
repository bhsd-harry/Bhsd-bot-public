'use strict';

const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{runMode} = require('../lib/dev'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Object.assign(Parser, {
	warning: false,
	config: './config/moegirl',
	internal: true,
});

(async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message, excerpt}) => message === '无效的属性值' && /\sscope\s*=\s*(["'])column\1/iu.test(excerpt),
	));
	if (targets.length === 0) {
		return;
	}
	let mode = runMode();
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复错误的scope属性');
		return;
	}
	const pageids = targets.map(([pageid]) => pageid),
		pages = await api.revisions({pageids}),
		edits = [];
	for (const {pageid, title, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, ns === 10, 4),
			/** @type {Parser.AttributeToken[]} */
			scopes = root.querySelectorAll('ext-attr#scope,html-attr#scope,table-attr#scope');
		for (const scope of scopes) {
			if (scope.getValue().toLowerCase() === 'column') {
				scope.setValue('col');
			}
		}
		const text = String(root);
		if (text !== content) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复错误的scope属性');
})();
