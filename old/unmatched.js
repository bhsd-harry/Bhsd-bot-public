'use strict';

const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{runMode} = require('../lib/dev'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Object.assign(Parser, {
	warning: false,
	config: './config/moegirl',
	internal: true,
});

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode(),
		selectedErrors = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(error => {
			const {message, excerpt} = error;
			if (message === '未匹配的结束标签') {
				const mt = /(<\/\w+>)[^<\n]+\1$/u.exec(excerpt);
				if (mt) {
					error.tag = mt[1].slice(2, -1).toLowerCase();
					return true;
				}
			}
			return false;
		}));
	if (selectedErrors.length === 0) {
		return;
	}
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	const pageids = selectedErrors.map(([pageid]) => pageid),
		pages = await api.revisions({pageids}),
		edits = [],
		del = new Set(['del', 's', 'strike']),
		heimu = ['黑幕', 'Block', 'Heimu'],
		heimuSelector = heimu.map(name => `template#${name}`).join();
	for (const {pageid, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, ns === 10, 3),
			tags = [...new Set(lintErrors[pageid].errors.map(({tag}) => tag).filter(Boolean))];
		for (const html of root.querySelectorAll(tags.map(tag => `html#${tag}[closing]`).join())) {
			if (String(html).length !== html.name.length + 3 || !root.contains(html)) {
				continue;
			}
			try {
				html.findMatchingTag();
				continue;
			} catch ({message}) {
				if (!message.startsWith('unmatched closing tag: ')) {
					continue;
				}
			}
			const {parentNode: {childNodes}} = html,
				siblings = childNodes.slice(childNodes.indexOf(html) + 1),
				i = siblings.findIndex(({type, name}) => type === 'html' && name === html.name),
				between = siblings.slice(0, i),
				betweenStr = between.map(node => node.text()).join('').trim();
			if (i >= 0 && siblings[i].closing && betweenStr && !betweenStr.includes('\n')) {
				html.closing = false;
				if (del.has(html.name) && (
					html.closest(heimuSelector)
					|| between.some(({type, name}) => type === 'template' && heimu.includes(name))
				)) {
					html.remove();
					siblings[i].remove();
				}
			}
		}
		const text = String(root);
		if (text !== content) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复未匹配的HTML结束标签');
};

if (!module.parent) {
	main();
}

module.exports = main;
