const Api = require('../lib/api'),
	{runMode, error} = require('../lib/dev'),
	WikiUrl = require('../lib/url'),
	{user, pin, url} = require('../config/user');

const protectedPages = [923, 359506];

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动修复误写作外链的内链');
			return;
		}
	}
	const pages = await api.search('insource:"zh.moegirl.org.cn"', {gsrnamespace: '0|10|14'});
	const editable = pages.filter(({pageid}) => !protectedPages.includes(pageid)),
		wikiUrl = new WikiUrl('zh.moegirl.org.cn', '/'),
		edits = editable.map(({content, pageid, timestamp, curtimestamp}) => {
			if (/{{[\s\u200e]*(?:[Ii]nuse|施工中|[编編][辑輯]中)/.test(content)) {
				error(`已跳过施工中的页面 ${pageid} ！`);
				return null;
			}
			return [pageid, content, wikiUrl.replace(content), timestamp, curtimestamp];
		}).filter(page => page).filter(([, content, text]) => content !== text);
	await api.massEdit(edits, mode, '自动修复误写作外链的内链');
};

if (!module.parent) {
	main();
}

module.exports = main;
