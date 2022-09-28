/* eslint-disable no-await-in-loop */
'use strict';

const Api = require('../lib/api'),
	{save, runMode, error} = require('../lib/dev'),
	{user, pin, url, enpin, japin} = require('../config/user'),
	Parser = require('wikiparser-node'),
	records = require('../config/langlinks'),
	config = {
		ja: {url: 'https://ja.moegirl.org.cn', pin: japin, name: '日'},
		en: {url: 'https://en.moegirl.org.cn', pin: enpin, name: '英'},
		zh: {url, pin, name: '中'},
	},
	sourceParams = {
		generator: 'allpages', gapnamespace: 0, gapfilterredir: 'nonredirects', gaplimit: 'max',
		gapfilterlanglinks: 'withlanglinks', prop: 'langlinks', lllimit: 'max',
	},
	targetParams = {
		action: 'query', prop: 'langlinks', lllimit: 'max', redirects: true, converttitles: true,
	},
	newLinks = [],
	apis = {},
	edits = {ja: [], en: [], zh: []};
Parser.warning = false;
Parser.config = './config/moegirl';

const ucfirst = str => str[0].toUpperCase() + str.slice(1);

const getSourcePages = (q, source) => {
	const pages = q.query.pages.map(({title, langlinks}) => ({
		title,
		langlinks: langlinks?.map(({lang, title: target}) => ({lang, title: ucfirst(target)}))
			?.filter(({title: target}) => !target.startsWith('Template:')),
	})).filter(({langlinks}) => langlinks?.length);
	for (const {title, langlinks} of pages) {
		const page = records.find(record => record[source] === title);
		if (!page) {
			newLinks.push({source, title, langlinks});
			continue;
		}
		const newLangLinks = langlinks.filter(({lang, title: target}) => page[lang] !== target);
		if (newLangLinks.length) {
			newLinks.push({source, title, langlinks: newLangLinks});
		}
	}
};

const getLangLinks = async (sourceApi, source, c = {}) => {
	const q = await sourceApi.get({...sourceParams, ...c});
	getSourcePages(q, source);
	if (q.continue) {
		return getLangLinks(sourceApi, source, q.continue);
	}
};

const sourceMain = async source => {
	const sourceApi = new Api(user, config[source].pin, config[source].url);
	await sourceApi.csrfToken();
	await getLangLinks(sourceApi, source);
	apis[source] = sourceApi;
};

const targetMain = async target => {
	const targetApi = apis[target],
		{name} = config[target],
		titles = [...new Set(
			newLinks.map(({langlinks}) => langlinks.find(({lang}) => lang === target)?.title).filter(title => title),
		)];
	if (titles.length) {
		const q = await targetApi.post({titles, ...targetParams}),
			conversion = [...q.query.normalized ?? [], ...q.query.converted ?? [], ...q.query.redirects ?? []];
		for (const {from, to} of conversion) {
			const convertedLangLinks = newLinks
				.filter(({langlinks}) => langlinks.some(({lang, title}) => lang === target && title === from));
			for (const {source, title} of convertedLangLinks) {
				edits[source].push({title, target, from, to});
			}
		}
		const pages = q.query.pages.filter(({missing}) => !missing);
		for (const {pageid, title, langlinks} of pages) {
			let appendtext = '';
			const relevantLinks = newLinks.filter(({langlinks: links}) =>
				links.some(({lang, title: langlink}) => lang === target && ucfirst(langlink) === title),
			);
			for (const {source, title: langlink} of relevantLinks) {
				const sourceLink = langlinks?.find(({lang}) => lang === source)?.title;
				if (!sourceLink) {
					appendtext += `[[${source}:${langlink}]]`;
					const record = records.find(pair => pair[target] === title || pair[source] === langlink);
					if (record) {
						record[target] = title;
						record[source] = langlink;
					} else {
						records.push({[target]: title, [source]: langlink});
					}
				} else if (ucfirst(sourceLink) !== langlink) {
					error(`${name}萌页面 ${pageid} 的${
						config[source].name
					}萌链接 [[${sourceLink}]] 与 [[${langlink}]] 不匹配！`);
				}
			}
			if (appendtext) {
				await targetApi.edit({pageid, appendtext, summary: `自动添加跨语言链接（测试）`});
			}
		}
		await save('../config/langlinks.json', records);
	}
};

const edit = async wiki => {
	const api = apis[wiki],
		mode = runMode(),
		pages = await api.revisions({titles: edits[wiki].map(({title}) => title)}),
		list = [];
	for (const {pageid, title, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, false, 6),
			{target, to} = edits[wiki].find(({title: thisTitle}) => title === thisTitle);
		root.querySelector(`link[interwiki=${target}]`)?.setLangLink(target, to);
		list.push([pageid, content, root.toString(), timestamp, curtimestamp]);
	}
	await api.massEdit(list, mode, '修正跨语言链接（测试）');
};

const main = async () => {
	for (const source of ['ja', 'en', 'zh']) {
		await sourceMain(source);
	}
	for (const target of ['ja', 'en', 'zh']) {
		await targetMain(target);
	}
	for (const wiki of ['ja', 'en', 'zh']) {
		await edit(wiki);
	}
};

main();
