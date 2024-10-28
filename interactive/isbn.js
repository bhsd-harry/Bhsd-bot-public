'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message}) => message === '无效的ISBN',
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
		await api.massEdit(null, mode, '自动添加[[T:ISBN]]');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		let text = content;
		// eslint-disable-next-line eqeqeq
		const errors = targets.find(([id]) => id == pageid)[1].errors.filter(({message}) => message === '无效的ISBN')
			.sort((a, b) => b.startIndex - a.startIndex);
		for (const {startIndex, endIndex, excerpt} of errors) {
			if (content.slice(startIndex, endIndex) !== excerpt) {
				continue;
			}
			const [, prefix, isbn] = /(ISBN[\p{Zs}\t\-:：]?)((?:\d[\p{Zs}\t-]?){4,}[\dXx])/u.exec(excerpt),
				preserve = /[-:：]$/u.test(prefix);
			text = `${text.slice(0, startIndex)}${preserve ? prefix : ''}{{ISBN|${isbn}${
				preserve ? `|${isbn}` : ''
			}}}${text.slice(endIndex)}`;
		}
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动添加[[T:ISBN]]');
};

if (!module.parent) {
	main();
}

module.exports = main;
