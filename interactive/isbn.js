'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode} = require('../lib/dev');
const formatISBN = require('../lib/isbn');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Object.assign(Parser, {
	warning: false,
	config: './config/moegirl',
	internal: true,
});
Parser.redirects.set('Template:Isbn', 'Template:ISBN');
Parser.redirects.set('Template:ISBN_for_Table', 'Template:ISBNT');
Parser.redirects.set('Template:Isbn_for_table', 'Template:ISBNT');
Parser.redirects.set('Template:Isbnt', 'Template:ISBNT');

const main = async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message}) => message === '无效的ISBN' || message === '包含至少一个待复核的ISBN模板',
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
		await api.massEdit(null, mode, '自动添加[[T:ISBN]]或调整ISBN格式');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		let text = content;
		// eslint-disable-next-line eqeqeq
		const relevant = targets.find(([id]) => id == pageid)[1].errors,
			errors = relevant.filter(({message}) => message === '无效的ISBN').sort((a, b) => b.startIndex - a.startIndex);
		for (const {startIndex, endIndex, excerpt} of errors) {
			if (text.slice(startIndex, endIndex) !== excerpt) {
				continue;
			}
			const mt = /^(ISBN[-:：]?[\p{Zs}\t]*)((?:\d[\p{Zs}\t-]?){4,}[\dXx])$/u.exec(excerpt);
			if (mt) {
				const [, prefix, isbn] = mt,
					preserve = /[-:：]/u.test(prefix);
				text = text.slice(0, startIndex) + (
					prefix === 'ISBN-'
					&& /^(?:10 (?:\d[\p{Zs}\t-]?){9}[\dx]|13 (?:\d[\p{Zs}\t-]?){12}[\dx])$/iu.test(isbn)
						? `{{ISBN|${isbn.slice(3)}|ISBN-${isbn}}}`
						: `${preserve ? prefix : ''}{{ISBN|${isbn}${preserve ? `|${isbn}` : ''}}}`
				) + text.slice(endIndex);
			}
		}
		if (content !== text || relevant.some(({message}) => message === '包含至少一个待复核的ISBN模板')) {
			const root = Parser.parse(text),
				/** @type {Parser.TranscludeToken[]} */
				templates = root.querySelectorAll(
					'template#Template:ISBN,template#Template:ISBNT,template#Template:Cite_book',
				);
			for (const template of templates) {
				if (template.name === 'Template:ISBN') {
					const formatted1 = formatISBN(template.getValue(1)),
						formatted2 = formatISBN(template.getValue(2));
					if (typeof formatted1 === 'string') {
						template.setValue(1, formatted1);
					}
					if (typeof formatted2 === 'string') {
						if (formatted1 === formatted2) {
							template.removeArg(2);
							if (!template.hasArg('noprefix') && !template.hasArg('plainlink')) {
								template.replaceTemplate('ISBNT');
							}
						} else {
							template.setValue(2, formatted2);
						}
					}
				} else if (template.name === 'Template:ISBNT') {
					const formatted = formatISBN(template.getValue(1));
					if (typeof formatted === 'string') {
						template.setValue(1, formatted);
					}
				} else {
					const formatted = formatISBN(template.getValue('isbn'));
					if (typeof formatted === 'string') {
						template.setValue('isbn', formatted);
					}
				}
			}
			text = String(root);
		}
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动添加[[T:ISBN]]或调整ISBN格式');
};

if (!module.parent) {
	main();
}

module.exports = main;
