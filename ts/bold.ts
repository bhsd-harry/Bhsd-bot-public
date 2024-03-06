'use strict';

import Parser = require('wikiparser-node');
import Api = require('../lib/api');
import {runMode} from '../lib/dev';
const {user, pin, url} = require('../config/user'),
	lintErrors: Record<number, {errors: Pick<Parser.LintError, 'message'>[]}> = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除标题中的加粗');
		return;
	}
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
			({message}) => message === '段落标题中的粗体',
		)),
		edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 7);
		for (const quote of root.querySelectorAll<Parser.QuoteToken>('heading-title > quote[bold]')) {
			if (quote.italic) {
				quote.setText("''");
			} else {
				quote.remove();
			}
		}
		for (const html of root.querySelectorAll<Parser.HtmlToken>('heading-title > html:is(#b, #strong)')) {
			html.remove();
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
