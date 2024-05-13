'use strict';

import Parser from 'wikiparser-node';
import Api = require('../lib/api');
import {save, runMode, error, info} from '../lib/dev';
const {user, pin, url, enpin, enurl, japin, jaurl} = require('../config/user'),
	records: {zh?: string, en?: string, ja?: string}[] = require('../config/langlinks'),
	config = {
		ja: {url: jaurl, pin: japin, name: '日', summary: '言語間リンクを追加または修正'},
		en: {url: enurl, pin: enpin, name: '英', summary: 'adding or amending interlanguage links'},
		zh: {url, pin, name: '中', summary: '添加或修正跨语言链接'},
	},
	sourceParams = {
		generator: 'allpages', gapfilterlanglinks: 'withlanglinks', gapfilterredir: 'nonredirects', gaplimit: 400,
		prop: 'langlinks', lllimit: 'max',
	},
	targetParams = {
		action: 'query', prop: 'langlinks', lllimit: 'max', redirects: true, converttitles: true,
	},
	newLinks = [],
	apis = {},
	corrections = {ja: [], en: [], zh: []},
	mode = runMode(),
	protectedPages = {zh: ['Category:即将删除的页面']},
	langs = ['ja', 'en', 'zh'] as const;
Parser.warning = false;
Parser.config = './config/moegirl';

const normalizeTitle = (title, lang) => {
	const normalized = Parser.normalizeTitle(title);
	return normalized.ns === 14 && lang === 'ja'
		? `カテゴリ:${normalized.main}`
		: normalized.title.replaceAll('_', ' ');
};

const getLangLinks = async (source, gapnamespace, c = {}, titles = []) => {
	const sourceApi = apis[source],
		q = await sourceApi.get({...sourceParams, ...c, gapnamespace}),
		pages = q.query.pages.map(({title, langlinks}) => ({
			title,
			langlinks: langlinks
				?.map(({lang, title: target}) => ({lang, title: normalizeTitle(target, lang)})),
		})).filter(({langlinks}) => langlinks?.length);
	titles.push(...pages.map(({title}) => title));
	for (const {title, langlinks} of pages) {
		const record = records.find(r => r[source] === title);
		if (!record) {
			newLinks.push({source, title, links: langlinks});
			continue;
		}
		const newLangLinks = langlinks.filter(
			({lang, title: target}) => record[lang] !== target && !protectedPages[lang]?.includes(target),
		);
		if (newLangLinks.length) {
			newLinks.push({source, title, links: newLangLinks});
		}
	}
	info(`已检查${config[source].name}萌的 ${pages.length} 个含跨语言链接的页面。`);
	return q.continue ? getLangLinks(source, gapnamespace, q.continue, titles) : titles;
};

const sourceMain = async (source: 'zh' | 'en' | 'ja') => {
	const sourceApi = new Api(user, config[source].pin, config[source].url);
	apis[source] = sourceApi;
	await sourceApi.login();
	const titles = (await Promise.all([getLangLinks(source, 0), getLangLinks(source, 14)])).flat(),
		missing = records.filter(({[source]: src}) => src && !titles.includes(src));
	if (missing.length) {
		info(`${config[source].name}萌可能缺失跨语言链接的页面：`);
		console.log(missing);
		for (const missingRecord of missing.filter(({[source]: src}) => !protectedPages[source]?.includes(src))) {
			for (const [lang, title] of Object.entries(missingRecord)) {
				if (lang !== source) {
					newLinks.push({source: lang, title, links: [{lang: source, title: missingRecord[source]}]});
				}
			}
		}
	}
};

// 调整跨语言链接的位置；不再使用
const arrangeZh = async () => { // eslint-disable-line no-unused-vars
	const newZh = newLinks.filter(({source, title}) => source === 'zh' && !records.some(({zh}) => zh === title)),
		api = apis['zh'];
	if (newZh.length) {
		const pages = await api.revisions({titles: newZh.map(({title}) => title)}),
			list = pages.map(({pageid, title, content, timestamp, curtimestamp}) => {
				const root = Parser.parse(content, false, 6),
					{links} = newZh.find(({title: t}) => t === title);
				for (const {lang} of links) {
					const token = root.querySelector(`link[interwiki=${lang}]:not(':contains(:${lang})')`),
						index = token?.getAbsoluteIndex();
					if (index <= 500 && content.length > 3 * index
						|| token?.offsetTop < 10 && root.offsetHeight > 20
					) {
						root.append(token);
					}
				}
				const text = root.toString();
				return text !== content && [pageid, content, text, timestamp, curtimestamp];
			}).filter(page => page);
		if (mode !== 'dry' && list.length) {
			await api.csrfToken();
		}
		await api.massEdit(list, mode, '调整跨语言链接的位置');
	}
};

const targetMain = async target => {
	const targetApi = apis[target],
		{name} = config[target],
		titles = [...new Set(
			newLinks.map(({links}) => links.find(({lang}) => lang === target)?.title).filter(title => title),
		)];
	if (!titles.length) {
		return;
	}
	const {query} = await targetApi.post({titles, ...targetParams}),
		conversion = [...query.converted ?? [], ...query.redirects ?? []];
	for (const {from, to} of conversion) {
		const converted = newLinks
			.filter(({links}) => links.some(({lang, title}) => lang === target && title === from));
		for (const {source, title} of converted) {
			corrections[source].push({
				title, target, from,
				to: conversion.find(({from: secondFrom}) => secondFrom === to)?.to ?? to,
			});
		}
	}
	const pages = query.pages.filter(({missing}) => !missing),
		missingTitles = query.pages.filter(({missing}) => missing).map(({title}) => title);
	if (missingTitles.length) {
		info(`${config[target].name}萌缺失的页面：`);
		console.log(missingTitles);
	}
	for (const {pageid, title, langlinks} of pages) {
		let appendtext = '';
		const relevantLinks = newLinks.filter(({links}) =>
			links.some(({lang, title: link}) => lang === target && link === title),
		);
		for (const {source, title: sourceTitle} of relevantLinks) {
			const sourceLink = langlinks?.find(({lang}) => lang === source)?.title;
			if (!sourceLink) {
				appendtext += `[[${source}:${sourceTitle}]]`;
				if (appendtext === '[[en:Donkey Kong]]' && target === 'zh' && pageid === 566996) {
					appendtext = '';
				}
			} else if (sourceLink !== sourceTitle) {
				const sourceName = config[source].name;
				error(`${name}萌页面 ${pageid} 的${sourceName}萌链接 [[${
					sourceLink
				}]] 与${sourceName}萌页面 [[${sourceTitle}]] 不匹配！预计将于第三步修正。`);
				corrections[target].push({title, target: source, from: sourceLink, to: sourceTitle});
			}
			const record = records.find(r => r[target] === title || r[source] === sourceTitle);
			if (record) {
				record[target] = title;
				record[source] = sourceTitle;
			} else {
				records.push({[target]: title, [source]: sourceTitle});
			}
		}
		if (appendtext) {
			const params = {pageid, appendtext, summary: config[target].summary};
			if (mode === 'dry') {
				console.log(params);
			} else {
				await targetApi.csrfToken();
				await targetApi.edit(params);
			}
		}
	}
};

const editMain = async wiki => {
	const api = apis[wiki],
		pages = await api.revisions({titles: corrections[wiki].map(({title}) => title)}),
		list = [];
	for (const {pageid, title, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 6);
		let record = records.find(r => r[wiki] === title);
		if (!record) {
			record = {[wiki]: title};
			records.push(record);
		}
		for (const {target, to} of corrections[wiki].filter(({title: thatTitle}) => title === thatTitle)) {
			root.querySelector<Parser.LinkToken>(`link[interwiki=${target}]:not(':contains(:${target})')`)?.setLangLink(target, to);
			record[target] = to;
		}
		const text = root.toString();
		if (content !== text) {
			list.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	if (mode !== 'dry' && list.length) {
		await api.csrfToken();
	}
	await api.massEdit(list, mode, config[wiki].summary);
};

const main = async () => {
	for (const source of langs) {
		await sourceMain(source);
	}
	if (newLinks.length) {
		info('新增的跨语言链接：');
		console.log(newLinks.map(({source, title, links}) => ({
			source, title, ...Object.fromEntries(links.map(({lang, title: t}) => [lang, t])),
		})));
	}
	info('第一步：检查所有跨语言链接页面执行完毕。');
	for (const target of langs) {
		await targetMain(target);
	}
	info('第二步：检查待修改的跨语言链接页面执行完毕。');
	for (const wiki of langs) {
		await editMain(wiki);
	}
	await save('../config/langlinks.json', records);
};

main();
