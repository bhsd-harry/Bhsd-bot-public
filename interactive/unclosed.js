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

const nestable = new Set(['span', 'big', 'small']),
	skip = new Set([231_651, 237_081, 237_973, 238_289, 242_567, 243_737, 248_355, 253_129, 253_789, 255_749, 290_730]);

(async (api = new Api(user, pin, url, true)) => {
	const regex = new RegExp(
			String.raw`^<(?:center|font|code|ins|h\d|del|strike|strong|em|cite|sup|sub|[sbiu]|${
				[...nestable].join('|')
			})[\s>]`,
			'iu',
		),
		targets = Object.entries(lintErrors).filter(([pageid, {errors}]) => !skip.has(Number(pageid)) && errors.some(
			({message, excerpt}) => message === '未闭合的标签' && regex.test(excerpt.slice(-70))
				|| message === '未闭合的<noinclude>',
		));
	if (targets.length === 0) {
		return;
	}
	let mode = runMode();
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
	const pageids = targets.map(([pageid]) => pageid),
		pages = await api.revisions({pageids}),
		edits = [];
	for (const {pageid, title, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, ns === 10, 8);
		if (lintErrors[pageid].errors.some(({message}) => message === '未闭合的标签')) {
			const /** @type {Map<Parser.Token, Record<string, Parser.HtmlToken | true>>} */ unclosed = new Map();
			for (const html of root.querySelectorAll('html[closing=false][selfClosing=false]')) {
				const {parentNode, name} = html;
				if (!regex.test(`<${name}>`) || html.findMatchingTag()) {
					continue;
				}
				const cur = unclosed.get(parentNode);
				if (!cur) {
					unclosed.set(parentNode, {[name]: html});
				} else if (cur[name]) {
					if (nestable.has(name)) {
						let {nextSibling} = html;
						while (nextSibling && !nextSibling.text().trim()) {
							({nextSibling} = nextSibling);
						}
						if (nextSibling) {
							cur[name] = true;
							continue;
						}
					}
					delete cur[name];
					if (Object.keys(cur).length === 0) {
						unclosed.delete(parentNode);
					}
					html.closing = true;
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
					while (
						nextSibling && !(nextSibling.type === 'text' && nextSibling.data.includes('\n'))
					) {
						({nextSibling} = nextSibling);
					}
					if (!nextSibling) {
						if (html.nextSibling) {
							const {lastChild} = parentNode;
							parentNode.append(`</${key}>`);
							if (lastChild.type === 'text') {
								const [trailing] = /(?<!\s)\s*$/u.exec(lastChild.data);
								if (trailing) {
									lastChild.deleteData(-trailing.length);
									parentNode.append(trailing);
								}
							}
						} else {
							html.remove();
						}
					} else if (
						key !== 'center' && key !== 'font' && key !== 'span'
						|| !nextSibling.nextSibling && !nextSibling.data.trimEnd().includes('\n')
					) {
						if (html.nextSibling === nextSibling && /^[^\S\n]*\n/u.test(nextSibling.data)) {
							html.remove();
						} else {
							nextSibling.replaceData(
								nextSibling.data.replace(/(?<!\s)[^\S\n]*\n/u, `</${key}>$&`),
							);
						}
					}
				}
			}
		}
		if (lintErrors[pageid].errors.some(({message}) => message === '未闭合的<noinclude>')) {
			/** @type {Parser.IncludeToken[]} */
			const includes = root.querySelectorAll('include[closed=false]');
			for (const include of includes) {
				const re = new RegExp(`<${include.name}>`, 'iu');
				if (re.test(include.innerText)) {
					include.innerText = include.innerText.replace(re, `</${include.name}>`);
				} else if (include.eof && !include.innerText.trim()) {
					include.remove();
				}
			}
		}
		const text = String(root);
		if (text !== content) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复未闭合的HTML标签');
})();
