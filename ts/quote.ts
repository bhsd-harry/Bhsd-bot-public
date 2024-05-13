'use strict';

import Parser from 'wikiparser-node';
import Api = require('../lib/api');
import {runMode} from '../lib/dev';
const {user, pin, url} = require('../config/user'),
	lintErrors: Record<number, {errors: Pick<Parser.LintError, 'message'>[]}> = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	let mode = runMode('redry');
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动闭合引号');
		return;
	}
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(({message}) => message === '未闭合的引号')),
		edits = [],
		pages: {pageid: number, content: string, timestamp: string, curtimestamp: string}[] =
			await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 4);
		for (const attr of root.querySelectorAll<Parser.AttributeToken>('ext-attr, html-attr, table-attr')) {
			if (attr.value === true) {
				continue;
			}
			const value = attr.value.replace(/(?<=\S)\s+$/u, '');
			if (!attr.balanced && !value.includes('=')) {
				attr.close();
				if (value.endsWith("''")) {
					attr.value = value.slice(0, -2);
				} else if (/[”"']$/.test(value)) {
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
