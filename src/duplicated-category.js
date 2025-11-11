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
		({message}) => message === '重复的分类',
	));
	const mode = runMode();
	if (targets.length === 0 && mode !== 'redry') {
		return;
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除重复的分类');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, title, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, false, 6),
			/** @type {Parser.CategoryToken[]} */
			cats = root.querySelectorAll('category:not(":has(comment)")');
		for (let i = 0; i < cats.length; i++) {
			const cat = cats[i];
			if (!root.contains(cat)) {
				continue;
			}
			const {length, sortkey, parentNode} = cat,
				ancestors = cat.getAncestors();
			for (let j = i + 1; j < cats.length; j++) {
				const otherCat = cats[j];
				if (
					!root.contains(otherCat)
					|| otherCat.name !== cat.name
					|| length === 2 && otherCat.length === 2 && otherCat.sortkey !== sortkey
				) {
					continue;
				}
				const commonAncestor = otherCat.getAncestors().find(
						ancestor => ancestors.includes(ancestor),
					),
					catIsChild = parentNode === commonAncestor,
					otherCatIsChild = otherCat.parentNode === commonAncestor;
				if (
					!catIsChild && (!otherCatIsChild || length > otherCat.length)
					|| !otherCatIsChild && otherCat.length > length
				) {
					continue;
				}
				const target = !catIsChild || otherCatIsChild && otherCat.length > length ? cat : otherCat,
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
