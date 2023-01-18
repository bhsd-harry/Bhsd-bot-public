'use strict';

const Parser = require('wikiparser-node'),
	Api = require('../lib/api'),
	{save, runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

const generateErrors = pages => {
	for (const {ns, pageid, title, content} of pages) {
		const errors = Parser.parse(content, ns === 10 && !title.endsWith('/doc')).lint();
		if (title.startsWith('三国杀')) {
			for (let i = errors.length - 1; i > 0; i--) {
				const {message: right, startLine: rightLine, startCol: rightStart, endCol: rightEnd} = errors[i],
					{message: left, startLine: leftLine, startCol: leftStart, endCol: leftEnd} = errors[i - 1];
				if (right === '孤立的"}"' && left === '孤立的"{"' && leftLine === rightLine
					&& rightEnd - rightStart === 1 && leftEnd - leftStart === 1
				) {
					errors.splice(--i, 2);
				}
			}
		}
		if (errors.length === 0) {
			delete lintErrors[pageid];
		} else {
			lintErrors[pageid] = {title, errors};
		}
	}
};

(async (api = new Api(user, pin, url)) => {
	const mode = runMode('upload');
	await api[mode === 'upload' ? 'csrfToken' : 'login']();
	if (mode === 'upload' || mode === 'dry') {
		const pages = await api.revisions({pageids: Object.keys(lintErrors)});
		generateErrors(pages);
		const text = `{|class=wikitable\n!页面!!错误类型!!位置\n|-\n${
			Object.values(lintErrors).filter(({errors}) => errors.some(({severity}) => severity === 'error'))
				.map(({title, errors}) => {
					errors = errors.filter(({severity}) => severity === 'error').sort((a, b) =>
						a.startLine - b.startLine || a.startCol - b.startCol
						|| a.endLine - b.endLine || a.endCol - b.endCol);
					return `|${errors.length > 1 ? `rowspan=${errors.length}|` : ''}[[${title}]]|${
						errors.map(({message, startLine, startCol, endLine, endCol}) =>
							`|${
								message
							}||第 ${startLine + 1} 行第 ${startCol + 1} 列 ⏤ 第 ${endLine + 1} 行第 ${endCol + 1} 列`)
							.join('\n|-\n')
					}`;
				}).join('\n|-\n')
		}\n|}`;
		if (mode === 'upload') {
			await api.edit({title: 'User:Bhsd-bot/可能存在语法错误的条目', text});
		} else {
			console.log(text);
		}
	} else {
		const qs = {
				generator: 'recentchanges', grcnamespace: '0|10|12|14', grclimit: 500, grctype: 'edit|new',
				grcexcludeuser: 'Bhsd', grcend: new Date(Date.now() - 3600 * 1000).toISOString(),
			},
			pages = await api.revisions(qs);
		generateErrors(pages);
	}
	await save('../config/lintErrors.json', lintErrors);
})();
