/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('../lib/api'),
	Interface = require('../lib/interface'),
	{user, pin, url} = require('../config/user'),
	{info, save, runMode} = require('../lib/dev'),
	{exturl} = require('../lib/exturl'),
	{run, dry} = require('../config/extLink'),
	{geuquery} = run;

const api = new Api(user, pin, url),
	chat = new Interface(),
	protectedPages = [923],
	[,,, geulimit] = process.argv;

(async () => {
	const mode = runMode('redry');
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await Promise.all([
			api.massEdit(null, mode, '自动修复http链接'),
			mode === 'rerun' ? save('../config/extLink.json', {run: {geuquery, ...dry}}) : null,
		]);
		return;
	}
	if (geulimit) {
		run.geulimit = geulimit;
	}
	const [pages, c] = await api.extSearch(run),
		editable = pages.filter(({pageid}) => !protectedPages.includes(pageid));
	if (editable.length > 0) { // 否则直接跳过，记录euoffset
		const edits = await exturl(editable, chat);
		await api.massEdit(edits, mode, '自动修复http链接');
	}
	if (c === undefined) {
		info('已全部检查完毕！');
	} else if (mode === 'dry') {
		await save('../config/extLink.json', {run, dry: c});
		info(`下次检查从 ${c.geuoffset} 开始。`);
	} else {
		await save('../config/extLink.json', {run: {geuquery, ...c}});
	}
})();
