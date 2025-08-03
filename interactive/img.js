'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	/** @type {Parser.ConfigData} */ config = require('wikiparser-node/config/moegirl');
config.ext = config.ext.filter(t => t !== 'img');
config.html[2].push('img');
Parser.warning = false;
Parser.config = config;

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message, excerpt}) => (message === '孤立的"<"' || message === '非法的属性值')
			&& /<img\s/iu.test(excerpt),
	));
	if (targets.length === 0) {
		return;
	}
	// eslint-disable-next-line prefer-const
	let mode = runMode();
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' || mode === 'update' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复<img>标签', process.argv[3]);
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, ns === 10, 3),
			/** @type {Parser.HtmlToken[]} */
			imgs = root.querySelectorAll('html#img');
		let changed = false;
		for (const img of imgs) {
			if (img.firstChild.querySelector(':not(html-attr-dirty, html-attr, attr-key, attr-value)')) {
				let output = '{{#img:';
				for (const key of img.getAttrNames()) {
					const value = img.getAttr(key);
					if (typeof value === 'string') {
						output += `|${key}=${value}`;
					}
				}
				output += '}}';
				img.replaceWith(output);
				changed = true;
			} else if (!img.selfClosing) {
				img.selfClosing = true;
				changed = true;
			}
		}
		if (!changed) {
			continue;
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复<img>标签');
};

if (!module.parent) {
	main();
}

module.exports = main;
