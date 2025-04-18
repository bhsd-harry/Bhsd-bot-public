'use strict';

import imported = require('wikiparser-node');
import Api = require('../lib/api');
import {save, runMode, error, info, diff} from '../lib/dev';
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	rcend = require('../config/lint'),
	Parser: imported = global.Parser ?? imported,
	skipped = new Set([
		12047, 29447, 36417, 110496, 116564, 127733, 152762, 167743, 269336, 270094, 278812, 282144, 291562, 306168, 316878,
		324442, 329782, 343842, 368772, 375376, 386222, 388572, 400978, 404396, 428339, 429558, 435825, 436541, 436830, 436832,
		437916, 463871, 473730, 478783, 506704, 529969, 539875, 562221, 569667, 570954, 573334, 573665, 574319, 588383,
	]);
Parser.i18n = require('wikiparser-node/i18n/zh-hans');
Parser.warning = false;
Parser.config = require('wikiparser-node/config/moegirl');

const mode = runMode(['upload', 'all', 'search', 'dry-upload']),
	hasArg = new Set();
let gapcontinue = require('../config/allpages');

const trTemplate = [
		'Ptl',
		'Template Repeat',
		'Kiraraf广播',
		'舰C任务模板',
		'音游曲信息/musync',
		'音游曲信息/CHUNITHM',
		'音游曲信息/太鼓',
		'音游曲信息/synchronica',
		'音游曲信息/maimai',
		'音游曲信息/Muse Dash',
		'音游曲信息/sdvx',
		'音游曲信息/音击',
		'BangdreamSongGai/Game',
		'D4DJSongGai/Game',
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

const generateErrors = async (pages, errorOnly = false) => {
	for (const {ns, pageid, title, content, missing, redirects = []} of pages) {
		if (missing || ns === 2 || skipped.has(pageid) || /^Template:(?:Sandbox|沙盒)\//.test(title)) {
			delete lintErrors[pageid];
			continue;
		}
		Parser.redirects.clear();
		for (const {title: t} of redirects) {
			Parser.redirects.set(t, title);
		}
		let errors;
		try {
			const root = Parser.parse(content, ns === 10),
				text = String(root);
			if (text !== content) {
				error(`${pageid}在解析过程中修改了原始文本！`);
				await diff(content, text, true);
			}
			errors = root.lint().map(e => ({...e, excerpt: text.slice(Math.max(0, e.startIndex - 30), e.startIndex + 70)}))
				.filter(({rule, message, excerpt, severity}) =>
					!(rule === 'fostered-content' && (trTemplateRegex.test(excerpt.slice(-70)) || magicWord.test(excerpt.slice(-70))))
					&& !((message === '孤立的"["' || message === '孤立的"]"' || title.startsWith('三国杀') && message === '孤立的"{"') && severity === 'warning')
					&& !(rule === 'unknown-page' && /\{\{(?:星座|[Aa]strology|[Ss]tr[ _]crop|[Tr]rim[ _]prefix|少女歌[剧劇]\/角色信息)\|/u.test(excerpt))
					&& !(message === '多余的fragment' && /#\s*(?:\||\]\])/.test(excerpt))
					&& !(message === '重复参数' && /(?<!\{)\{\{\s*c\s*\}\}/iu.test(excerpt))
					&& !(rule === 'table-layout' && /(?:row|col)span\s*=.+\s\{\{n\/a(?:\||\}\})/iu.test(excerpt))
					&& !(title.startsWith('三国杀') && message === '孤立的"}"')
					&& !(message === 'URL中的全角标点' && excerpt.includes('魔法纪录中文Wiki'))
					&& !(rule === 'obsolete-attr' || rule === 'obsolete-tag'),
				);
			for (const token of root.links ?? []) {
				if (token.type === 'ext-link' || token.type === 'free-ext-link') {
					continue;
				}
				const {link} = token;
				if (typeof link === 'object' && link.title === title) {
					const {top, left, height, width} = token.getBoundingClientRect();
					errors.push({
						message: '自身链接',
						severity: 'error',
						startLine: top,
						startCol: left,
						endLine: top + height - 1,
						endCol: height === 1 ? left + width : width,
						excerpt: String(token),
					});
				}
			}
		} catch (e) {
			error(`页面 ${pageid} 解析或语法检查失败！`, e);
			continue;
		}
		if (title.startsWith('三国杀')) {
			errors = errors.filter(
				({severity, message}) => message !== '孤立的"}"' && (severity === 'error' || message !== '孤立的"{"'),
			);
		}
		if (errors.length === 0) {
			delete lintErrors[pageid];
		} else if (errorOnly && !errors.some(({message}) => message === '内链目标包含模板')) {
			//
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
	switch (mode) {
		case 'dry': {
			const pageids = Object.keys(lintErrors),
				batch = 300;
			for (let i = 0; i < pageids.length / batch; i++) {
				const pages = await api.revisions({pageids: pageids.slice(i * batch, (i + 1) * batch)});
				await generateErrors(pages);
			}
			break;
		}
		case 'dry-upload':
		case 'upload': {
			const text = '==可能的语法错误==\n{|class="wikitable sortable"\n'
			+ `!页面!!错误类型!!class=unsortable|位置!!class=unsortable|源代码摘录\n|-\n${
				Object.values(lintErrors).map(({title, errors}) => {
					errors = errors.filter(
						({severity, message, excerpt}) =>
							severity === 'error' && !(message === '孤立的"}"' && excerpt.endsWith('}-'))
							|| message === 'URL中的"|"' || message === '内链目标包含模板',
					).sort((a, b) =>
						a.startLine - b.startLine || a.startCol - b.startCol
						|| a.endLine - b.endLine || a.endCol - b.endCol);
					return errors.length
						? `|${errors.length > 1 ? `rowspan=${errors.length}|` : ''}[[:${title}]]（[{{fullurl:${title}|action=edit}} 编辑]）\n${
							errors.map(({message, startLine, startCol, endLine, endCol, excerpt}) =>
								`|${
									message.replace(/<(\w+)>/u, '&lt;$1&gt;')
										.replace(/"([{}[\]|]|https?:\/\/)"/u, '"<nowiki>$1</nowiki>"')
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
			} else {
				console.log(text);
			}
			return;
		}
		case 'all': {
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
			break;
		}
		case 'search': {
			let {argv: [,,, q]} = process;
			if (!q) {
				throw new RangeError('缺失搜索字符串！');
			}
			q = q.replaceAll('"', '');
			info(`搜索字符串：${q}`);
			const pages = await api.search(`insource:"${q}"`, {gsrnamespace: 0});
			await generateErrors(pages);
			break;
		}
		default: {
			const last = rcend && new Date(rcend),
				now = new Date().toISOString(),
				yesterday = new Date(Date.now() - 3600 * 1e3 * 24 * 30),
				grcend = (last > yesterday ? last : yesterday).toISOString(),
				qs = {
					generator: 'recentchanges', grcnamespace: '0|10|12|14', grclimit: 500, grctype: 'edit|new',
					grcexcludeuser: 'Bhsd', grcend,
				},
				pages = await api.revisions(qs);
			await generateErrors(pages);
			await save('../config/lint.json', now);
		}
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
	if (mode !== 'dry-upload') {
		await api[mode === 'upload' ? 'csrfToken' : 'login']();
	}
	if (mode === 'all') {
		while (gapcontinue) { // eslint-disable-line no-unmodified-loop-condition
			console.log(gapcontinue);
			await main(api);
		}
	} else {
		main(api);
	}
})();
