'use strict';

const Parser = require('wikiparser-node'),
	Api = require('../lib/api'),
	{save, runMode, error, info, diff} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	rcend = require('../config/lint');
Parser.warning = false;
Parser.config = Parser.minConfig ? Parser.getConfig('./config/moegirl') : './config/moegirl';

const mode = runMode(['upload', 'all']),
	hasArg = new Set();
let gapcontinue = require('../config/allpages');

const trTemplate = [
		'Ptl',
		'Template Repeat',
		'Kiraraf广播',
		'舰C任务模板',
		'音游曲信息/musync',
		'动画作品剧情模板',
		'Album Infobox/Chronology',
		'嵌入片段',
		'KPL Runoff/Single',
		'BestGirlContestEveryPerson',
		':BanG Dream!少女乐团派对!/历史活动/EventInfo',
		':D4DJ Groovy Mix/历史活动/EventInfo',
	],
	trTemplateRegex = new RegExp(`^\\s*(?:<[Tt][Rr][\\s/>]|\\{{3}|\\{{2}\\s*(?:!!\\s*\\}{2}|(?:${
		trTemplate.map(template => `[${template[0]}${template[0].toLowerCase()}]${template.slice(1).replaceAll(' ', '[ _]')}`)
			.join('|')
	})\\s*\\|))`, 'u'),
	magicWord = /^\s*\{\{\s*#(?:invoke|forargs|fornumargs|loop|if|ifeq|switch):/iu;

const generateErrors = async (pages, errorOnly = true) => {
	for (const {ns, pageid, title, content} of pages) {
		if (ns === 2) {
			continue;
		}
		let errors;
		try {
			const root = Parser.parse(content, ns === 10),
				text = String(root);
			if (text !== content) {
				error(`${pageid}在解析过程中修改了原始文本！`);
				await diff(content, text);
			}
			errors = root.lint().filter(({message, excerpt}) => !(
				message === '将被移出表格的内容' && (trTemplateRegex.test(excerpt) || magicWord.test(excerpt))
				|| message === '重复参数' && /^[^=]*\{\{\s*c\s*\}\}/iu.test(excerpt)
			));
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
			errors = errors.filter(({severity}) => severity === 'error');
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
				await generateErrors(pages);
			}
		}
		const text = '==可能的语法错误==\n{|class="wikitable sortable"\n'
		+ `!页面!!错误类型!!class=unsortable|位置!!class=unsortable|源代码摘录\n|-\n${
			Object.values(lintErrors).map(({title, errors}) => {
				errors = errors.filter(
					({severity, message, startCol, endCol}) =>
						severity === 'error' && message !== '孤立的"}"' && !(message === '孤立的"{"' && endCol - startCol === 1),
				).sort((a, b) =>
					a.startLine - b.startLine || a.startCol - b.startCol
					|| a.endLine - b.endLine || a.endCol - b.endCol);
				return errors.length
					? `|${errors.length > 1 ? `rowspan=${errors.length}|` : ''}[[:${title}]]\n${
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
			await generateErrors(
				pages.filter(({revisions}) => revisions && revisions[0]?.contentmodel === 'wikitext')
					.map(page => ({...page, content: page.revisions[0].content})),
				true,
			);
		}
		await save('../config/allpages.json', apcontinue ?? {});
		gapcontinue = apcontinue; // eslint-disable-line require-atomic-updates
	} else {
		const last = rcend && new Date(rcend),
			now = new Date().toISOString(),
			yesterday = new Date(Date.now() - 3600 * 1000),
			grcend = (last > yesterday ? last : yesterday).toISOString(),
			qs = {
				generator: 'recentchanges', grcnamespace: '0|10|12|14', grclimit: 500, grctype: 'edit|new',
				grcexcludeuser: 'Bhsd', grcend,
			},
			pages = await api.revisions(qs);
		await generateErrors(pages);
		await save('../config/lint.json', now);
	}
	if (hasArg.size > 0) {
		info(`共 ${hasArg.size} 个页面包含未预期的模板参数。`);
		const qs = {pageids: [...hasArg], prop: 'transcludedin', tinamespace: '*', tishow: '!redirect', tilimit: 'max'},
			pageids = [];
		let q;
		do {
			q = await api.get({...qs, ...q?.continue});
			pageids.push(...q.query.pages.filter(({transcludedin}) => transcludedin).map(({pageid}) => pageid));
		} while (q.continue);
		for (const pageid of pageids) {
			const page = lintErrors[pageid];
			page.errors = page.errors.filter(({message}) => message !== '未预期的模板参数');
			if (page.errors.length === 0) {
				delete lintErrors[pageid];
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
