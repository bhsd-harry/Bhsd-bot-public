'use strict';

const Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors)
		.filter(([, {errors}]) => errors.some(({message}) => message === '未闭合的引号'));
	if (targets.length === 0) {
		return;
	}
	// eslint-disable-next-line prefer-const
	let mode = runMode();
	if (mode === 'run') {
		// mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动闭合引号');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {ns, pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, ns === 10, 4);
		for (const attr of root.querySelectorAll('ext-attr,html-attr,table-attr')) {
			if (attr.value === true) {
				continue;
			}
			const value = attr.value.replace(/(?<=\S)\s+$/u, '');
			if (!attr.balanced && !value.includes('=')) {
				attr.close();
				if (value.endsWith("''") || value.endsWith('‘‘')) {
					attr.value = value.slice(0, -2);
				} else if (/[”"']$/u.test(value)) {
					attr.value = value.slice(0, -1);
				}
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动闭合引号');
};

if (!module.parent) {
	main();
}

module.exports = main;
