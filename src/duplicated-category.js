'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message}) => message === '重复的分类',
	));
	if (targets.length === 0) {
		return;
	}
	const mode = runMode();
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除重复的分类');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 6),
			/** @type {Parser.CategoryToken[]} */ cats = root.querySelectorAll('category:not(":has(comment)")');
		for (const cat of cats) {
			if (!root.contains(cat)) {
				continue;
			}
			const {parentNode: {childNodes}, length, sortkey} = cat,
				/** @type {Parser.CategoryToken[]} */ otherCats = childNodes.filter(
					/** @param node {Parser.CategoryToken} */
					node => node.type === 'category' && node.name === cat.name && node !== cat
						&& (length === 1 || node.length === 1 || node.sortkey === sortkey),
				);
			for (const otherCat of otherCats) {
				const target = otherCat.length === 1 ? otherCat : cat,
					{previousSibling, nextSibling} = target;
				if (
					previousSibling?.type === 'text'
					&& nextSibling?.type !== 'category'
					&& /\n[^\S\n]*$/u.test(previousSibling.data)
				) {
					const {data} = previousSibling,
						l = data.trimEnd().length;
					previousSibling.deleteData(l + data.slice(l).indexOf('\n'));
				}
				target.remove();
				if (target === cat) {
					break;
				}
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
