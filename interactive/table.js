'use strict';

const Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

(async () => {
	const api = new Api(user, pin, url),
		mode = runMode();
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复未闭合的表格');
		return;
	}
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
			({message, excerpt}) => message === '未闭合的表格' && excerpt?.startsWith('\n|-}'),
		)),
		edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 4);
		for (const table of root.querySelectorAll('table[closed=false]')) {
			const tr = table.lastChild,
				str = String(tr);
			if (str.startsWith('\n|-}')) {
				Parser.run(() => {
					table.close('\n|}');
				});
				tr.remove();
				table.after(str.slice(4));
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复未闭合的表格');
})();
