'use strict';

const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{runMode} = require('../lib/dev'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.config = './config/moegirl';
Parser.warning = false;

const main = async (api = new Api(user, pin, url)) => {
	const regex = /^<(?:center|font|code|ins|h\d|del|strike|strong|em|cite|sup|sub|[sbiu])[\s>]/iu,
		selectedErrors = Object.entries(lintErrors).filter(([, {errors}]) => errors.filter(
			({message, excerpt}) => message === '未闭合的标签' && regex.test(excerpt),
		).length > 1);
	if (selectedErrors.length === 0) {
		return;
	}
	let mode = runMode('redry');
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复未闭合的HTML标签');
		return;
	}
	const pageids = selectedErrors.map(([pageid]) => pageid),
		pages = await api.revisions({pageids}),
		edits = [];
	for (const {pageid, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, ns === 10, 3);
		for (const html of root.querySelectorAll('html[closing=false][selfClosing=false]')) {
			const {parentNode, name} = html;
			if (!regex.test(`<${name}>`)) {
				continue;
			}
			try {
				html.findMatchingTag();
				continue;
			} catch ({message}) {
				if (!message.startsWith('unclosed tag: ')) {
					continue;
				}
			}
			if (parentNode.unclosed?.[name]) {
				parentNode.unclosed[name] = false;
				html.closing = true;
			} else {
				parentNode.unclosed ||= {};
				parentNode.unclosed[name] = true;
			}
		}
		const text = String(root);
		if (text !== content) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复未闭合的HTML标签');
};

if (!module.parent) {
	main();
}

module.exports = main;
