'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	/** @type {Parser.ConfigData} */ config = require('wikiparser-node/config/moegirl');
const [,,, ...ids] = process.argv,
	skip = new Set();
config.ext.push('sm2');
Parser.warning = false;
Parser.config = config;

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = ids.length === 0
		? Object.entries(lintErrors).filter(
			([pageid, {errors}]) => !skip.has(Number(pageid))
				&& errors.some(({message, excerpt}) => message === '孤立的"<"' && /<sm2\b/iu.test(excerpt)),
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
		await api.massEdit(null, mode, '自动修复<sm2>标签', ids);
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, title, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, ns === 10, 3),
			/** @type {Parser.ExtToken[]} */
			exts = root.querySelectorAll('ext#sm2');
		for (const ext of exts) {
			ext.replaceWith(`{{sm2|${ext.innerText}}}`);
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复<sm2>标签');
};

if (!module.parent) {
	main();
}

module.exports = main;
