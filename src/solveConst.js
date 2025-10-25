'use strict';

const Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors)
		.filter(([, {errors}]) => errors.some(({message}) => message === '未预期的模板参数'));
	const mode = runMode();
	if (targets.length === 0 && mode !== 'redry') {
		return;
	}
	if (mode === 'run') {
		// mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除不应出现的模板参数');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, title, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, false, 2),
			text = String(root.solveConst());
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动移除不应出现的模板参数');
};

if (!module.parent) {
	main();
}

module.exports = main;
