/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('../lib/api'),
	{user, pin, url} = require('../config/user'),
	{info, save, runMode} = require('../lib/dev'),
	{exturl} = require('../lib/exturl'),
	params = require('../config/extLink'),
	{geuquery} = params;

const api = new Api(user, pin, url),
	protectedPages = [923],
	[,,, geulimit] = process.argv;

(async () => {
	const mode = runMode();
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		const c = require('../config/euoffset');
		await Promise.all([
			api.massEdit(null, mode, '自动修复http链接'),
			save('../config/extLink.json', {geuquery, ...c}),
		]);
		return;
	}
	if (geulimit) {
		params.geulimit = geulimit;
	}
	const [pages, c] = await api.extSearch(params),
		editable = pages.filter(({pageid}) => !protectedPages.includes(pageid));
	if (editable.length > 0) { // 否则直接跳过，记录euoffset
		const edits = await exturl(editable);
		await api.massEdit(edits, mode, '自动修复http链接');
	}
	if (c === undefined) {
		info('已全部检查完毕！');
	} else if (mode === 'dry') {
		await save('../config/euoffset.json', c);
		info(`下次检查从 ${c.geuoffset} 开始。`);
	} else {
		await save('../config/extLink.json', {geuquery, ...c});
	}
})();
