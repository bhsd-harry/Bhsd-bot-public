'use strict';

const Parser = require('wikiparser-node'),
	Api = require('../lib/api'),
	{save, runMode, error, info} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Parser.warning = false;
Parser.config = Parser.minConfig ? Parser.getConfig('./config/moegirl') : './config/moegirl';

const mode = runMode(['upload', 'all']),
	hasArg = new Set();
let gapcontinue = require('../config/allpages');

const trTemplate = ['Ptl', 'Template Repeat', 'Kiraraf广播'],
	trTemplateRegex = new RegExp(`^\\s*(?:<[Tt][Rr][\\s/>]|\\{\\{\\s*(?:!!\\s*\\}\\}|(?:${
		trTemplate.map(template => `[${template[0]}${template[0].toLowerCase()}]${template.slice(1).replaceAll(' ', '[ _]')}`)
			.join('|')
	})\\s*\\|))`, 'u');

const generateErrors = (pages, errorOnly = true) => {
	for (const {ns, pageid, title, content} of pages) {
		let errors;
		try {
			errors = Parser.parse(content, ns === 10 && !title.endsWith('/doc')).lint()
				.filter(
					({message, excerpt}) => message !== '将被移出表格的内容' || !trTemplateRegex.test(excerpt),
				);
		} catch (e) {
			error(`页面 ${pageid} 解析或语法检查失败！`, e);
			continue;
		}
		if (title.startsWith('三国杀')) {
			for (let i = errors.length - 1; i > 0; i--) {
				const {message} = errors[i];
				if (message === '孤立的"}"' || message === '孤立的"{"') {
					errors.splice(--i, 2);
				}
			}
		}
		if (errorOnly) {
			errors = errors.filter(({severity}) => severity !== 'warning');
		}
		if (errors.length === 0) {
			delete lintErrors[pageid];
		} else {
			for (const e of errors) {
				if (!Number.isNaN(e.startIndex)) {
					delete e.startIndex;
					delete e.endIndex;
				}
			}
			lintErrors[pageid] = {title, errors};
			if (errors.some(({message}) => message === '未预期的模板参数')) {
				hasArg.add(pageid);
			}
		}
	}
};

const main = async (api = new Api(user, pin, url)) => {
	if (mode === 'upload' || mode === 'dry') {
		if (mode === 'dry') {
			const pageids = Object.keys(lintErrors),
				batch = 300;
			for (let i = 0; i < pageids.length / batch; i++) {
				const pages = await api.revisions({pageids: pageids.slice(i * batch, (i + 1) * batch)});
				generateErrors(pages);
			}
		}
		const text = '==可能的语法错误==\n{|class="wikitable sortable"\n'
		+ `!页面!!错误类型!!class=unsortable|位置!!class=unsortable|源代码摘录\n|-\n${
			Object.values(lintErrors).map(({title, errors}) => {
				errors = errors.filter(
					({severity, message, startCol, endCol}) =>
						severity !== 'warning' && message !== '未匹配的闭合标签' && message !== '孤立的"}"'
						&& !(message === '孤立的"{"' && endCol - startCol === 1),
				).sort((a, b) =>
					a.startLine - b.startLine || a.startCol - b.startCol
					|| a.endLine - b.endLine || a.endCol - b.endCol);
				return errors.length
					? `|${errors.length > 1 ? `rowspan=${errors.length}|` : ''}[[${title}]]\n${
						errors.map(({message, startLine, startCol, endLine, endCol, excerpt}) =>
							`|${
								message.replace(/<(\w+)>/u, '&lt;$1&gt;')
									.replace(/"([{}[\]|]|https?:)"/u, '"<nowiki>$1</nowiki>"')
							}||第 ${startLine + 1} 行第 ${startCol + 1} 列 ⏤ 第 ${endLine + 1} 行第 ${endCol + 1} 列\n|<pre>${
								excerpt.replaceAll('<nowiki>', '&lt;nowiki&gt;').replaceAll('-{', '-&#123;')
							}</pre>`)
							.join('\n|-\n')
					}`
					: false;
			}).filter(Boolean).join('\n|-\n')
		}\n|}\n\n[[Category:积压工作]]\n[[Category:萌娘百科数据报告]]`;
		if (mode === 'upload') {
			await api.edit({title: '萌娘百科:可能存在语法错误的条目', text, section: 1, summary: '自动更新语法错误'});
			return;
		}
		// console.log(text);
	} else if (mode === 'all') {
		const qs = {
				generator: 'allpages', gapnamespace: 0, gapfilterredir: 'nonredirects', gaplimit: 500,
				prop: 'revisions', rvprop: 'content|contentmodel', ...gapcontinue,
			},
			{query, continue: apcontinue} = await api.get(qs),
			pages = query?.pages;
		info(`已获取 ${pages?.length ?? 0} 个页面的源代码`);
		if (pages) {
			generateErrors(
				pages.filter(({revisions}) => revisions && revisions[0]?.contentmodel === 'wikitext')
					.map(page => ({...page, content: page.revisions[0].content})),
				true,
			);
		}
		await save('../config/allpages.json', apcontinue);
		gapcontinue = apcontinue; // eslint-disable-line require-atomic-updates
	} else {
		const qs = {
				generator: 'recentchanges', grcnamespace: '0|10|12|14', grclimit: 500, grctype: 'edit|new',
				grcexcludeuser: 'Bhsd', grcend: new Date(Date.now() - 3600 * 1000).toISOString(),
			},
			pages = await api.revisions(qs);
		generateErrors(pages);
	}
	if (hasArg.size > 0) {
		info(`共 ${hasArg.size} 个页面包含未预期的模板参数。`);
		const qs = {pageids: [...hasArg], prop: 'transcludedin', tinamespace: 0, tishow: '!redirect', tilimit: 1},
			{query: {pages}} = await api.get(qs);
		for (const {pageid, transcludedin} of pages) {
			if (transcludedin) {
				const page = lintErrors[pageid];
				page.errors = page.errors.filter(({message}) => message !== '未预期的模板参数');
				if (page.errors.length === 0) {
					delete lintErrors[pageid];
				}
			}
		}
		hasArg.clear();
	}
	await save('../config/lintErrors.json', lintErrors);
};

(async () => {
	const api = new Api(user, pin, url);
	await api[mode === 'upload' ? 'csrfToken' : 'login']();
	if (mode === 'all') {
		while (gapcontinue) { // eslint-disable-line no-unmodified-loop-condition
			console.log(gapcontinue);
			await main(api);
		}
	} else {
		main(api);
	}
})();
