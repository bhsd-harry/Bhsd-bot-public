'use strict';

import Parser from 'wikiparser-node';
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
		await api.massEdit(null, mode, '自动移除重复的分类');
		return;
	}
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
			({message}) => message === '重复的分类',
		)),
		edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 6);
		for (const cat of root.querySelectorAll<Parser.CategoryToken>('category')) {
			if (!root.contains(cat)) {
				continue;
			}
			const {parentNode: {childNodes}} = cat,
				otherCats = childNodes.filter(
					(node): node is Parser.CategoryToken => node.type === 'category' && node.name === cat.name && node !== cat,
				);
			for (const otherCat of otherCats) {
				(otherCat.length === 1 ? otherCat : cat).remove();
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动移除重复的分类');
};

if (!module.parent) {
	main();
}

module.exports = main;
