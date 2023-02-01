'use strict';

const Api = require('../lib/api'),
	{runMode, save} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	Parser = require('wikiparser-node');
Parser.config = './config/moegirl';
Parser.warning = false;

const skip = [535567],
	pageids = [],
	api = new Api(user, pin, url);

const findBrackets = text => {
	const brackets = [],
		root = Parser.parse(text, false, 8);
	for (const token of root.querySelectorAll(':visible')) {
		let index;
		token.childNodes.forEach(({type, data}, i) => {
			if (type === 'text' && /[[\]]/.test(data)) {
				index ??= token.getAbsoluteIndex();
				const bracket = root.posFromIndex(index + token.getRelativeIndex(i)),
					newLines = data.match(/^\n*/)[0].length;
				if (newLines) {
					bracket.top += newLines;
					bracket.left = 0;
				}
				brackets.push({...bracket, line: root.getLine(bracket.top)});
			}
		});
	}
	return brackets;
};

(async () => {
	let mode = runMode();
	if (mode === 'run') {
		mode = 'dry';
	} else if (mode === 'redry') {
		await api.massEdit(null, mode);
		return;
	}
	let run = new Date(),
		dry;
	try {
		({dry, run} = require('../config/abuse8'));
	} catch {}
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		if (!dry) {
			throw new Error('没有保存的dry run！');
		}
		await Promise.all([
			api.massEdit(null, mode, '自动修复不匹配的方括号'),
			save('../config/abuse8.json', {run: dry}), // 将上一次dry run转化为实际执行
		]);
		return;
	}
	const last = new Date(run),
		now = new Date().toISOString(),
		yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 30);
	const date = (last > yesterday ? last : yesterday).toISOString(), // 不追溯超过1个月
		pages = await (pageids.length ? api.revisions({pageids}) : api.taggedRecentChanges('方括号不配对', date));
	let edits = [];
	for (const {pageid, content, timestamp, curtimestamp} of pages) {
		if (skip.includes(pageid)) {
			continue;
		}
		const brackets = findBrackets(content);
		if (brackets.length) {
			console.log({pageid, brackets});
			edits.push([
				pageid, content,
				content.replace(/\[ (?=(?:https?:)?\/\/)/gi, '[')
					.replace(/(?<!\[)(https?:\/\/[^[\]]+\]|\[[^[\]]+\]\])(?!\])/gi, '[$1')
					.replace(/\[\[[^[\]]+\](?!\])/g, '$&]')
					.replace(/\[(?:https?:)?\/\/[^\]]+(?=<\/ref\s*>)/gi, '$&]')
					.replace(/\[(?:https?:)?\/\/[^\]]+\]/gi, p => p.replaceAll('\n', ' ')),
				timestamp, curtimestamp,
			]);
		}
	}
	edits = edits.filter(([, content, text]) => content !== text);
	await Promise.all([
		edits.length > 0 ? api.massEdit(edits, mode, '自动修复不匹配的方括号') : null,
		pageids.length
			? null
			: save('../config/abuse8.json', mode === 'dry' && edits.length > 0 ? {run, dry: now} : {run: now}),
	]);
})();
