'use strict';

const Api = require('../lib/api'),
	{save} = require('../lib/dev'),
	{user, pin, url, enpin, japin} = require('../config/user'),
	records = require('../config/langlinks'),
	config = process.argv[2] === 'ja'
		? {url: 'https://ja.moegirl.org.cn', pin: japin, lang: 'ja', name: '日'}
		: {url: 'https://en.moegirl.org.cn', pin: enpin, lang: 'en', name: '英'},
	record = records[config.lang],
	enParams = {
		generator: 'allpages', gapnamespace: 0, gapfilterredir: 'nonredirects', gaplimit: 'max',
		gapfilterlanglinks: 'withlanglinks', prop: 'langlinks', lllimit: 'max', lllang: 'zh',
	};

const getEnPages = query => query.query.pages.filter(({langlinks}) => langlinks)
	.map(({title, langlinks: [{title: langlink}]}) => ({title, langlink}))
	.filter(({title, langlink}) => langlink !== 'Template:存疑翻译' && !record.includes(title));
const getZhPages = query => query.query.pages.filter(({missing, langlinks}) => !missing && !langlinks)
	.map(({title}) => title);

const getLangLinks = async (enApi, c = {}, pages = []) => {
	const q = await enApi.get({...enParams, ...c});
	pages.push(...getEnPages(q));
	if (!q.continue) {
		return pages;
	}
	return getLangLinks(enApi, q.continue, pages);
};

const main = async () => {
	const zhApi = new Api(user, pin, url),
		enApi = new Api(user, config.pin, config.url),
		zhParams = {
			action: 'query', prop: 'langlinks', lllimit: 'max', lllang: config.lang,
			redirects: true, converttitles: true,
		};
	await Promise.all([zhApi.csrfToken(), enApi.login()]);
	const pages = await getLangLinks(enApi),
		titles = [...new Set(pages.map(({langlink}) => langlink))];
	if (titles.length) {
		const q2 = await zhApi.post({titles: titles.join('|'), ...zhParams}),
			conversion = [...q2.query.normalized, ...q2.query.converted, ...q2.query.redirects],
			pages2 = getZhPages(q2),
			result = pages2.map(zh => {
				const page = pages.find(({langlink}) =>
					langlink === zh || conversion.some(({from, to}) => from === langlink && to === zh),
				);
				return page && {zh, en: page.title};
			}).filter(page => page);
		for (const {zh, en} of result) {
			// eslint-disable-next-line no-await-in-loop
			await zhApi.edit({
				title: zh, appendtext: `[[${config.lang}:${en}]]`, summary: `自动添加${config.name}萌链接（测试）`,
			});
		}
		record.push(...titles);
		await save('../config/langlinks.json', records);
	}
};

main();
