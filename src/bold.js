'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Object.assign(Parser, {
	warning: false,
	config: './config/moegirl',
	internal: true,
});

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message}) => message === '章节标题中的加粗文本',
	));
	const mode = runMode();
	if (targets.length === 0 && mode !== 'redry') {
		return;
	}
	if (mode === 'run') {
		// mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除标题中的加粗');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, title, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, false, 7);
		for (const quote of root.querySelectorAll('heading-title quote[bold]')) {
			if (quote.closest('heading-title,ext').type === 'ext') {
				continue;
			} else if (quote.italic) {
				quote.setText("''");
			} else {
				quote.remove();
			}
		}
		for (const html of root.querySelectorAll('heading-title html:is(#b, #strong)')) {
			if (html.closest('heading-title,ext').type === 'heading-title') {
				html.remove();
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动移除标题中的加粗');
};

if (!module.parent) {
	main();
}

module.exports = main;
