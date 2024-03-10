'use strict';

const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{runMode} = require('../lib/dev'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.config = './config/moegirl';
Parser.warning = false;

const nestable = new Set(['span', 'big', 'small']);

const main = async (api = new Api(user, pin, url)) => {
	const regex = new RegExp(
			`^<(?:center|font|code|ins|h\\d|del|strike|strong|em|cite|sup|sub|[sbiu]|${
				[...nestable].join('|')
			})[\\s>]`,
			'iu',
		),
		selectedErrors = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
			({message, excerpt}) => message === '未闭合的标签' && regex.test(excerpt.slice(-70)),
		));
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
		const root = Parser.parse(content, ns === 10, 8),
			/** @type {Map<Parser.Token, Record<string, Parser.HtmlToken | true>>} */ unclosed = new Map();
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
			const cur = unclosed.get(parentNode);
			if (!cur) {
				unclosed.set(parentNode, {[name]: html});
			} else if (cur[name]) {
				if (nestable.has(name)) {
					cur[name] = true;
				} else {
					delete cur[name];
					if (Object.keys(cur).length === 0) {
						unclosed.delete(parentNode);
					}
					html.closing = true;
				}
			} else {
				cur[name] = html;
			}
		}
		for (const [parentNode, cur] of unclosed) {
			const keys = Object.keys(cur),
				[key] = keys;
			if (keys.length === 1) {
				const html = cur[key];
				if (html === true) {
					continue;
				}
				let /** @type {{nextSibling: Parser.AstText}} */ {nextSibling} = html;
				while (nextSibling && !(nextSibling.type === 'text' && nextSibling.data.includes('\n'))) {
					({nextSibling} = nextSibling);
				}
				if (!nextSibling) {
					if (!html.nextSibling) {
						html.remove();
					} else {
						parentNode.append(`</${key}>`);
					}
				} else if (key !== 'center' || !nextSibling.nextSibling && !nextSibling.data.trimEnd().includes('\n')) {
					if (html.nextSibling === nextSibling && /^[^\S\n]*\n/u.test(nextSibling.data)) {
						html.remove();
					} else {
						nextSibling.replaceData(nextSibling.data.replace(/(?<!\s)[^\S\n]*\n/u, `</${key}>$&`));
					}
				}
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
