'use strict';

const Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message}) => message === '包含无效属性名的元素' || message === '同时闭合和自封闭的标签',
	));
	const mode = runMode();
	if (targets.length === 0 && mode !== 'redry') {
		return;
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复语法错误的HTML标签');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, title, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, false, 3);
		for (const br of root.querySelectorAll('html#br,html#wbr,html#hr')) {
			br.closing = false;
			const {firstChild} = br;
			if (String(firstChild).trim() === '/') {
				firstChild.sanitize();
				br.selfClosing = true;
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复语法错误的HTML标签');
};

if (!module.parent) {
	main();
}

module.exports = main;

