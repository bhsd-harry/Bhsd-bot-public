'use strict';

const Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

(async () => {
	const api = new Api(user, pin, url);
	let mode = runMode();
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除不应出现的模板参数');
		return;
	}
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(({message}) => message === '未预期的模板参数')),
		edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 2);
		root.solveConst();
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, String(root), timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动移除不应出现的模板参数');
})();
