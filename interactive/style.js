'use strict';

const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{runMode} = require('../lib/dev'),
	lintErrors = require('../config/lintErrors'),
	Parser = require('wikiparser-node');
Parser.config = './config/moegirl';
Parser.warning = false;

(async (api = new Api(user, pin, url, true)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message, excerpt}) => message === 'Unknown property: "align"'
			|| message === 'semi-colon expected' && /\b\s+padding:\.5em; padding:\.5em|[：；]|\bwidth\s*=/iu.test(excerpt)
			|| message === 'property value expected' && /text-align\s*:\s*;/iu.test(excerpt)
			|| message === '} expected' && /\sstyle\s*=\s*["']\s*;/iu.test(excerpt),
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
		await api.massEdit(null, mode, '自动移除无效的CSS属性');
		return;
	}
	const pageids = targets.map(([pageid]) => pageid),
		pages = await api.revisions({pageids}),
		edits = [];
	for (const {pageid, title, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, title, ns === 10, 4),
			/** @type {Parser.AttributeToken[]} */
			styles = root.querySelectorAll('ext-attr#style,html-attr#style,table-attr#style');
		for (const style of styles) {
			const {lastChild} = style,
				value = String(lastChild);
			if (
				/^\s*;|[：；]|\bwidth\s*=|(?:^|;)\s*align\s*:|text-align\s*:\s*;|\b\s+padding:\.5em; padding:\.5em/iu
					.test(value)
			) {
				const newValue = value.replace(
					// eslint-disable-next-line @stylistic/max-len
					/^\s*;\s*|(?<=^|;)\s*(?:align\s*:[^;]+;?|text-align\s*:\s*;)|\b\s+padding:\.5em(?=; padding:\.5em)/giu,
					'',
				).replace(/\bwidth\s*=/iu, 'width:')
					.replaceAll('：', ':')
					.replaceAll('；', ';')
					.trim();
				if (newValue) {
					lastChild.replaceChildren(newValue);
				} else {
					style.remove();
				}
			}
		}
		const text = String(root);
		if (text !== content) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动移除无效的CSS属性');
})();
