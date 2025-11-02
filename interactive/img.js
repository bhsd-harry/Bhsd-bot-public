'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	/** @type {Parser.ConfigData} */ config = require('wikiparser-node/config/moegirl');
const [,,, ...ids] = process.argv,
	skip = new Set([389_682, 436_605]);
config.ext = config.ext.filter(t => t !== 'img');
config.html[2].push('img');
Parser.warning = false;
Parser.config = config;

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = ids.length === 0
		? Object.entries(lintErrors).filter(
			([pageid, {errors}]) => !skip.has(Number(pageid)) && errors.some(
				({message, excerpt, severity}) =>
					(message === '孤立的"<"' || message === '孤立的"{"' && severity === 'error')
					&& /<img\s|\ssrc\s*(?:=|\{\{\s*=\s*\}\})\s*["']?\{\{/iu.test(excerpt),
			),
		)
		: ids.map(id => [id]);
	if (targets.length === 0) {
		return;
	}
	let mode = runMode();
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' || mode === 'update' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复<img>标签', ids);
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, title, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, ns === 10, 3),
			/** @type {Parser.HtmlToken[]} */
			imgs = root.querySelectorAll('html#img');
		let changed = false;
		for (const img of imgs) {
			if (
				img.firstChild.querySelector(':not(html-attr-dirty,html-attr,attr-key,attr-value)')
				|| /\{\{\s*=\s*\}\}/u.test(String(img.firstChild))
			) {
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
