/* eslint-disable no-await-in-loop */
'use strict';

const Api = require('../lib/api'),
	{save, runMode, error, info} = require('../lib/dev'),
	{user, pin, url, enpin, enurl, japin, jaurl} = require('../config/user'),
	Parser = require('wikiparser-node'),
	records = require('../config/langlinks'),
	config = {
		ja: {url: jaurl, pin: japin, name: '日', summary: '言語間リンクを追加または修正'},
		en: {url: enurl, pin: enpin, name: '英', summary: 'adding or amending interlanguage links'},
		zh: {url, pin, name: '中', summary: '添加或修正跨语言链接'},
	},
	sourceParams = {
		generator: 'allpages', gapfilterlanglinks: 'withlanglinks', gapfilterredir: 'nonredirects', gaplimit: 500,
		prop: 'langlinks', lllimit: 'max',
	},
	targetParams = {
		action: 'query', prop: 'langlinks', lllimit: 'max', redirects: true, converttitles: true,
	},
	newLinks = [],
	apis = {},
	corrections = {ja: [], en: [], zh: []},
	mode = runMode();
Parser.warning = false;
Parser.config = './config/moegirl';

const getLangLinks = async (source, c = {}, titles = []) => {
	const sourceApi = apis[source],
		q = await sourceApi.get({...sourceParams, ...c}),
		pages = q.query.pages.map(({title, langlinks}) => ({
			title,
			langlinks: langlinks
				?.map(({lang, title: target}) => ({lang, title: Parser.normalizeTitle(target).title})),
		})).filter(({langlinks}) => langlinks?.length);
	titles.push(...pages.map(({title}) => title));
	for (const {title, langlinks} of pages) {
		const record = records.find(r => r[source] === title);
		if (!record) {
			newLinks.push({source, title, links: langlinks});
			continue;
		}
		const newLangLinks = langlinks.filter(({lang, title: target}) => record[lang] !== target);
		if (newLangLinks.length) {
			newLinks.push({source, title, links: newLangLinks});
		}
	}
	info(`已检查${config[source].name}萌的 ${pages.length} 个含跨语言链接的页面。`);
	return q.continue ? getLangLinks(source, q.continue, titles) : titles;
};

const sourceMain = async source => {
	const sourceApi = new Api(user, config[source].pin, config[source].url);
	apis[source] = sourceApi;
	await sourceApi.login();
	const titles = await getLangLinks(source),
		missing = records.filter(({[source]: src}) => src && !titles.includes(src));
	if (missing.length) {
		info(`${config[source].name}萌可能缺失跨语言链接的页面：`);
		console.log(missing);
		for (const missingRecord of missing) {
			for (const [lang, title] of Object.entries(missingRecord)) {
				if (lang !== source) {
					newLinks.push({source: lang, title, links: [{lang: source, title: missingRecord[source]}]});
				}
			}
		}
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
			links.some(({lang, title: link}) => lang === target && Parser.normalizeTitle(link).title === title),
		);
		for (const {source, title: sourceTitle} of relevantLinks) {
			const sourceLink = langlinks?.find(({lang}) => lang === source)?.title;
			if (!sourceLink) {
				appendtext += `[[${source}:${sourceTitle}]]`;
				const record = records.find(r => r[target] === title || r[source] === sourceTitle);
				if (record) {
					record[target] = title;
					record[source] = sourceTitle;
				} else {
					records.push({[target]: title, [source]: sourceTitle});
				}
			} else if (Parser.normalizeTitle(sourceLink).title !== sourceTitle) {
				const sourceName = config[source].name;
				error(`${name}萌页面 ${pageid} 的${sourceName}萌链接 [[${
					sourceLink
				}]] 与${sourceName}萌页面 [[${sourceTitle}]] 不匹配！预计将于第三步修正。`);
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
		}
		for (const {target, to} of corrections[wiki].filter(({title: thatTitle}) => title === thatTitle)) {
			root.querySelector(`link[interwiki=${target}]:not(':contains(:${target})')`)?.setLangLink(target, to);
			record[target] = to;
		}
		list.push([pageid, content, root.toString(), timestamp, curtimestamp]);
	}
	if (mode !== 'dry' && list.length) {
		await api.csrfToken();
	}
	await api.massEdit(list, mode, config[wiki].summary);
};

const main = async () => {
	for (const source of ['ja', 'en', 'zh']) {
		await sourceMain(source);
	}
	if (newLinks.length) {
		info('新增的跨语言链接：');
		console.log(newLinks.map(({source, title, links}) => ({
			source, title, ...Object.fromEntries(links.map(({lang, title: t}) => [lang, t])),
		})));
	}
	info('第一步：检查所有跨语言链接页面执行完毕。');
	for (const target of ['ja', 'en', 'zh']) {
		await targetMain(target);
	}
	info('第二步：检查待修改的跨语言链接页面执行完毕。');
	for (const wiki of ['ja', 'en', 'zh']) {
		await editMain(wiki);
	}
	await save('../config/langlinks.json', records);
};

main();
