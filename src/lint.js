'use strict';

const {performance} = require('perf_hooks'),
	imported = require('wikiparser-node'),
	{refreshStdout} = require('@bhsd/common'),
	{t2s} = require('../lib/tongwen'),
	Api = require('../lib/api'),
	{save, runMode, error, info, diff} = require('../lib/dev'),
	{update} = require('../src/boilerplate'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors'),
	boilerplates = require('../config/boilerplate'),
	rcend = require('../config/lint');
const /** @type {import('wikiparser-node')} */ Parser = globalThis.Parser ?? imported,
	skipped = new Set([
		100_877,
		110_496,
		358_642,
		404_396,
	]),
	reISBN = /isbn[-:：]?[\p{Zs}\t]?(?:\d[\p{Zs}\t-]?){4,}[\dx](?!\.(?:jpe?g|png|webp|gif))/giu;
Parser.i18n = require('wikiparser-node/i18n/zh-hans');
Parser.warning = false;
Parser.config = require('wikiparser-node/config/moegirl');

const mode = runMode(['upload', 'all', 'search', 'dry-upload', 'skipped']),
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
		'音游曲信息/Groove Coaster',
		'BangdreamSongGai/Game',
		'D4DJSongGai/Game',
		'动画作品剧情模板',
		'Album Infobox/Chronology',
		'嵌入片段',
		'KPL Runoff/Single',
		'BestGirlContestEveryPerson',
		':BanG Dream!少女乐团派对!/历史活动/EventInfo',
		'BanG_Dream!_少女乐团派对！历史活动信息',
		':D4DJ Groovy Mix/历史活动/EventInfo',
		'星穹铁道遗器表格',
		'星穹铁道光锥表格',
	],
	trTemplateRegex = new RegExp(String.raw`^\s*(?:<[Tt][Rr][\s/>]|\{{3}|\{{2}\s*(?:!!\s*\}{2}|(?:${
		trTemplate
			.map(template => `[${template[0]}${template[0].toLowerCase()}]${
				template.slice(1).replaceAll(' ', '[ _]')
			}`).join('|')
	})\s*\|))`, 'u'),
	magicWord = /^\s*\{\{\s*#(?:invoke|forargs|fornumargs|loop|if|ifeq|switch):/iu,
	/** @link https://github.com/lihaohong6/MGP-bots/blob/master/bots/link_adjust.py */
	ytParams = ['feature', 'ab_channel'],
	bbParams = [
		'from',
		'seid',
		'spm_id_from',
		'vd_source',
		'from_spmid',
		'referfrom',
		'bilifrom',
		'share_source',
		'share_medium',
		'share_plat',
		'share_session_id',
		'share_tag',
		'share_times',
		'timestamp',
		'bbid',
		'ts',
		'from_source',
		'broadcast_type',
		'is_room_feed',
		'msource',
		'noTitleBar',
		'hasBack',
		'jumpLinkType',
		'timestamp',
		'unique_k',
		'goFrom',
		'ftype',
		'otype',
		'ctype',
		'share_from',
		'is_story_h5',
		'mid',
		'native.theme',
		'night',
		'a_id',
		's_id',
		'buvid',
		'up_id',
		'plat_id',
		'rt',
		'tdsourcetag',
		'accept_quality',
		'current_qn',
		'current_quality',
		'playurl_h264',
		'playurl_h265',
		'quality_description',
		'network',
		'network_status',
		'platform_network_status',
		'p2p_type',
		'visit_id',
		'bsource',
		'spm',
		'hotRank',
		'-Arouter',
		'type',
		'session_id',
		'theme',
		'spmid',
	],
	actions = ['history', 'info', 'watch', 'unwatch', 'rollback', 'render', 'submit', 'edit', 'raw'],
	params = ['mobileaction', 'useskin', 'hidelinks'],
	linkSelector = 'link,redirect-target,ext-link,free-ext-link,magic-link,image-parameter#link',
	norefererTemplates = [
		'NoReferer',
		'Producer_Song',
		'Producer_Music',
		'VOCALOID_&_UTAU_Ranking',
		'VOCALOID_Ranking',
		'WUGTop',
	].map(str => String.raw`template#Template\:${str}`).join(),
	messages = new Set([
		'段落标题中的粗体',
		'同时闭合和自封闭的标签',
		'重复的分类',
		'无效的图片参数',
		'未闭合的引号',
	]);

let worst;
const push = /** @param {imported.Token} token */ (errors, token, message, severity) => {
	const startIndex = token.getAbsoluteIndex(),
		endIndex = startIndex + String(token).length,
		{top, left, height, width} = token.getBoundingClientRect();
	errors.push({
		message,
		severity,
		startLine: top,
		startCol: left,
		startIndex,
		endLine: top + height - 1,
		endCol: height === 1 ? left + width : width,
		endIndex,
		excerpt: String(token),
	});
};
const generateErrors = async (pages, errorOnly = false) => {
	const boilerplatePages = pages.filter(({title}) => /^Template:页面格式\/(?:.(?!\/doc$))+$/u.test(title));
	for (const {title, content, missing} of boilerplatePages) {
		if (missing) {
			delete boilerplates[title];
		} else {
			boilerplates[title] = update(content);
		}
	}
	const residuals = new Set(Object.values(boilerplates).flat());
	for (let i = 0; i < pages.length; i++) {
		const {ns, pageid, title, content, missing, redirects = []} = pages[i];
		refreshStdout(`${i} ${title}`);
		if (
			missing
			|| ns === 2
			|| mode !== 'skipped' && skipped.has(pageid)
			|| /^Template:(?:Sandbox|沙盒|页面格式)\//u.test(title)
		) {
			delete lintErrors[pageid];
			continue;
		}
		if (Parser.redirects) {
			Parser.redirects.clear();
			for (const {title: t} of redirects) {
				Parser.redirects.set(t, title);
			}
			Parser.redirects.set('Template:N/a', 'Template:N/A');
			Parser.redirects.set('Template:Isbn', 'Template:ISBN');
		}
		let errors;
		try {
			const start = performance.now(),
				root = Parser.parse(content, ns === 10),
				text = String(root);
			if (text !== content) {
				error(`\n${pageid}在解析过程中修改了原始文本！`);
				await diff(content, text, true);
			}
			const rawErrors = root.lint(),
				duration = performance.now() - start;
			if (!worst || duration > worst.duration) {
				worst = {title, duration};
			}
			errors = rawErrors
				.map(e => ({...e, excerpt: text.slice(Math.max(0, e.startIndex - 30), e.startIndex + 70)}))
				.filter(
					({rule, message, excerpt, severity}) =>
						!(
							rule === 'fostered-content'
							&& (trTemplateRegex.test(excerpt.slice(-70)) || magicWord.test(excerpt.slice(-70)))
						)
						&& !((message === '孤立的"["' || message === '孤立的"]"') && severity === 'warning')
						&& !(
							rule === 'unknown-page'
							&& /\{\{(?:星座|[Aa]strology|[Ss]tr[ _]crop|[Tr]rim[ _]prefix|少女歌[剧劇]\/角色信息)\|/u
								.test(excerpt)
						)
						&& !(message === '多余的fragment' && /#\s*(?:\||\]\])/u.test(excerpt))
						&& !(message === '重复参数' && /(?<!\{)\{\{\s*c\s*\}\}/iu.test(excerpt))
						&& !(
							title.startsWith('三国杀')
							&& (message === '孤立的"}"' || message === '孤立的"{"' && severity === 'warning')
						)
						&& !(title.startsWith('幻书启世录:') && message === '未闭合的标签' && severity === 'warning')
						&& !(message === 'URL中的全角标点' && /魔法纪录中文Wiki|\/Character\/Detail\//u.test(excerpt))
						&& !(rule === 'obsolete-attr' || rule === 'obsolete-tag' || rule === 'table-layout'),
				);
			if (errors.some(({excerpt}) => excerpt.includes('/umamusume/'))) {
				errors = errors.filter(({message}) => message !== 'URL中的全角标点');
			}
			for (const e of errors) {
				delete e.rule;
				delete e.fix;
				delete e.suggestions;
				if (messages.has(e.message)) {
					error(e.message, pageid);
				}
			}
			const noReferer = root.querySelector(norefererTemplates);
			let hasSelfLink = false;
			for (const token of root.links ?? []) {
				const {type} = token;
				if (type === 'ext-link' || type === 'free-ext-link') {
					try {
						const /** @type {URL} */ uri = token.getUrl(),
							{hostname, pathname, searchParams, protocol} = uri,
							bilibili = /(?:^|\.)bilibili\.com$/u.test(hostname);
						if (
							['b23.tv', 'bili2233.cn', 'youtu.be'].includes(hostname)
							|| bilibili && /^\/read\/mobile(?:$|\/)/u.test(pathname)
						) {
							push(errors, token, '待修正的链接', 'warning');
							error('待修正的链接', uri.toString());
						} else if (
							pathname === '/watch'
							&& /^(?:w{3}\.)?youtube\.com$/u.test(hostname)
							&& ytParams.some(p => searchParams.has(p))
							|| bilibili && bbParams.some(p => searchParams.has(p))
						) {
							push(errors, token, '无用的链接参数', 'warning');
							error('无用的链接参数', uri.toString());
						} else if (!noReferer && /^i\d\.hdslb\.com$/u.test(hostname) && protocol === 'https:') {
							push(errors, token, '引自bilibili的图片外链', 'warning');
							error('引自bilibili的图片外链', uri.toString());
						} else if (hostname === 'http' || hostname === 'https') {
							push(errors, token, '错误格式的外链', 'warning');
							error('错误格式的外链', uri.toString());
						} else if (hostname === 'zh.moegirl.org.cn' || hostname === 'commons.moegirl.org.cn') {
							const action = searchParams.get('action');
							if (!(
								action && actions.includes(action)
								|| params.some(param => searchParams.has(param))
							)) {
								push(errors, token, '误写作外链的内链', 'warning');
								error('误写作外链的内链', uri.toString());
							}
						}
					} catch {}
					continue;
				} else if (ns === 10 || type === 'redirect-target') {
					continue;
				} else if (
					type === 'magic-link'
					&& token.protocol === 'ISBN'
					&& !token.closest('template#Template:ISBN')
				) {
					push(errors, token, '无效的ISBN', 'warning');
					error('无效的ISBN', String(token));
					continue;
				}
				const {link} = token;
				if (typeof link === 'object') {
					const [isRedirect, target] = link.getRedirection();
					if ((isRedirect || !link.fragment) && t2s(target) === title) {
						push(errors, token, '自身链接', 'warning');
						hasSelfLink = true;
					}
				}
			}
			if (hasSelfLink) {
				error('自身链接', pageid);
			}
			const isbn = /** @type {string} */(content).matchAll(reISBN);
			for (const {index, 0: excerpt} of isbn) {
				const ele = root.elementFromIndex(index).parentNode;
				if (
					excerpt.startsWith('ISBN')
					&& ele && !ele.matches(linkSelector) && !ele.closest(`${linkSelector},template#Template:ISBN`)
				) {
					const {top, left} = root.posFromIndex(index);
					errors.push({
						message: '无效的ISBN',
						severity: 'warning',
						startLine: top,
						startCol: left,
						startIndex: index,
						endLine: top,
						endCol: left + excerpt.length,
						endIndex: index + excerpt.length,
						excerpt,
					});
					error('无效的ISBN', excerpt);
				}
			}
			if (!content.includes('虚拟UP主')) {
				let flag = false;
				for (const token of root.querySelectorAll('comment')) {
					if (residuals.has(token.innerText)) {
						push(errors, token, '预加载残留', 'warning');
						flag = true;
					}
				}
				if (flag) {
					error('预加载残留', pageid);
				}
			}
		} catch (e) {
			error(`\n页面 ${pageid} 解析或语法检查失败！`, e);
			continue;
		}
		if (errors.length === 0) {
			delete lintErrors[pageid];
		} else if (errorOnly && !errors.some(({message}) => message === '内链目标包含模板')) {
			//
		} else {
			lintErrors[pageid] = {title, errors};
			if (errors.some(({message}) => message === '未预期的模板参数' || message === '自身链接')) {
				hasArg.add(pageid);
			}
		}
	}
	console.log();
};

const main = /** @param {Api} api */ async api => {
	const qsRedirects = {
		prop: 'revisions|redirects',
		rdprop: 'title',
		rdlimit: 'max',
	};
	switch (mode) {
		case 'dry': {
			const pageids = Object.keys(lintErrors),
				batch = 300;
			for (let i = 0; i < pageids.length / batch; i++) {
				const pages = await api.revisions({pageids: pageids.slice(i * batch, (i + 1) * batch), ...qsRedirects});
				await generateErrors(pages);
				await save('../config/lintErrors.json', lintErrors);
			}
			break;
		}
		case 'dry-upload':
		case 'upload': {
			const text = '==可能的语法错误==\n{|class="wikitable sortable"\n'
				+ `!页面!!错误类型!!class=unsortable|位置!!class=unsortable|源代码摘录\n|-\n${
					Object.values(lintErrors).map(({title, errors}) => {
						errors = errors.filter(
							({severity, code, message, excerpt}) =>
								severity === 'error' && !(message === '孤立的"}"' && excerpt.endsWith('}-'))
								|| code
								|| message === `孤立的"'"`
								|| message === 'URL中的"|"'
								|| message === '内链目标包含模板'
								|| message === '段落标题中的粗体',
						).sort((a, b) =>
							a.startLine - b.startLine || a.startCol - b.startCol
							|| a.endLine - b.endLine || a.endCol - b.endCol);
						return errors.length > 0
							? `|${
								errors.length > 1 ? `rowspan=${errors.length}|` : ''
							}[[:${title}]]（[{{fullurl:${title}|action=edit}} 编辑]）\n${
								errors.map(({message, startLine, startCol, endLine, endCol, excerpt}) =>
									`|${
										message.replace(/<(\w+)>/u, '&lt;$1&gt;')
											.replace(/[{}[\]|]+|(?<=")https?:\/\/(?=")/u, '<nowiki>$&</nowiki>')
									}||第 ${startLine + 1} 行第 ${startCol + 1} 列 ⏤ 第 ${
										endLine + 1
									} 行第 ${endCol + 1} 列\n|<pre>${
										excerpt.replace(/<(nowiki|\/pre)>/giu, '&lt;$1&gt;').replaceAll('-{', '-&#123;')
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
					generator: 'allpages',
					gapnamespace: 0,
					gapfilterredir: 'nonredirects',
					gaplimit: 500,
					rvprop: 'content|contentmodel',
					...gapcontinue,
					...qsRedirects,
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
			const pages = await api.search(`insource:"${q}"`, {gsrnamespace: 0, ...qsRedirects});
			await generateErrors(pages);
			break;
		}
		case 'skipped': {
			const pages = await api.revisions({pageids: [...skipped], ...qsRedirects});
			await generateErrors(pages);
			break;
		}
		default: {
			const last = rcend && new Date(rcend),
				now = new Date().toISOString(),
				yesterday = new Date(Date.now() - 3600 * 1e3 * 24 * 7),
				grcend = (last > yesterday ? last : yesterday).toISOString(),
				qs = {
					generator: 'recentchanges',
					grcnamespace: '0|10|12|14',
					grclimit: 500,
					grctype: 'edit|new',
					grcend,
					...qsRedirects,
				},
				pages = await api.revisions(qs);
			await generateErrors(pages);
			await save('../config/lint.json', now);
		}
	}
	if (hasArg.size > 0) {
		info(`共 ${hasArg.size} 个页面包含未预期的模板参数或自身链接。`);
		const qs = {pageids: [...hasArg], prop: 'transcludedin', tinamespace: '*', tishow: '!redirect', tilimit: 'max'},
			pageids = [];
		let q;
		do {
			q = await api.get({...qs, ...q?.continue});
			pageids.push(...q.query.pages.filter(({transcludedin}) => transcludedin).map(({pageid}) => pageid));
		} while (q.continue);
		for (const pageid of pageids) {
			const page = lintErrors[pageid];
			page.errors = page.errors.filter(({message}) => message !== '未预期的模板参数' && message !== '自身链接');
			if (page.errors.length === 0) {
				delete lintErrors[pageid];
			}
		}
		hasArg.clear();
	}
	await Promise.all([
		save('../config/lintErrors.json', lintErrors),
		save('../config/boilerplate.json', boilerplates),
	]);
	if (worst) {
		info(`最耗时页面：${worst.title} (${worst.duration.toFixed(3)}ms)`);
	}
};

(async () => {
	const api = new Api(user, pin, url, true);
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
