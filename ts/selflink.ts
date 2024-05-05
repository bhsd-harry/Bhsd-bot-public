'use strict';

import Parser = require('wikiparser-node');
import {sify} from 'chinese-conv';
import Api = require('../lib/api');
import {runMode} from '../lib/dev';
const {user, pin, url} = require('../config/user'),
	lintErrors: Record<number, {errors: Pick<Parser.LintError, 'message'>[]}> = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

const main = async (api = new Api(user, pin, url)) => {
	let mode = runMode();
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动修复自身链接');
		return;
	}
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
			({message}) => message === '自身链接',
		)),
		edits = [],
		pages = await api.revisions({
			pageids: targets.map(([pageid]) => pageid),
			prop: 'revisions|redirects',
			rdprop: 'title',
			rdshow: '!fragment',
			rdlimit: 'max',
		});
	for (const {title, pageid, content, timestamp, curtimestamp, redirects = []} of pages) {
		Parser.redirects.clear();
		for (const {title: t} of redirects) {
			Parser.redirects.set(t, title);
		}
		const root = Parser.parse(content, false, 6);
		for (const token of root.links ?? []) {
			if (token.type === 'ext-link' || token.type === 'free-ext-link') {
				continue;
			}
			const {link, type} = token;
			if (typeof link === 'object' && !link.fragment && sify(link.title) === title) {
				if (type === 'image-parameter') {
					token.setValue('');
				} else if (type === 'link') {
					token.replaceWith(token.innerText);
				}
			}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动修复自身链接');
};

if (!module.parent) {
	main();
}

module.exports = main;
