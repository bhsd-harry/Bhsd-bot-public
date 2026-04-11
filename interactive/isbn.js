'use strict';

const {execSync} = require('child_process');
const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Object.assign(Parser, {
	warning: false,
	config: './config/moegirl',
	internal: true,
});
Parser.redirects.set('Template:Isbn', 'Template:ISBN');

const isbnDir = '../ISBN-normaliser-forMGP';

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
		await api.massEdit(null, mode, '自动添加[[T:ISBN]]或调整ISBN格式（测试）');
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
			const root = Parser.parse(text);
			for (const template of root.querySelectorAll('template#Template:ISBN')) {
				const hasArg2 = template.getValue(2),
					value = hasArg2 || template.getValue(1),
					mt = value && /(?:\d[\p{Zs}\t-]?){9,12}(?:\d|x\b)/iu.exec(value);
				if (!mt) {
					continue;
				}
				try {
					const formatted = execSync(
						`python ${isbnDir}/isbn_normalise.py --xml ${isbnDir}/RangeMessage.xml ${
							mt[0].replace(/[\p{Zs}\t-]/gu, '')
						}`,
						{encoding: 'utf8'},
					).trim();
					if (formatted !== mt[0]) {
						template.setValue(
							hasArg2 ? 2 : 1,
							value.slice(0, mt.index) + formatted + value.slice(mt.index + mt[0].length),
						);
					}
				} catch {}
			}
			text = String(root);
		}
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动添加[[T:ISBN]]或调整ISBN格式（测试）');
};

if (!module.parent) {
	main();
}

module.exports = main;
