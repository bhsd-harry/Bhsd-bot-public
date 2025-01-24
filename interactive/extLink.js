/** @file 用于修复http链接 */
'use strict';
const Api = require('../lib/api'),
	Interface = require('../lib/interface'),
	{user, pin, url} = require('../config/user'),
	{info, save, runMode} = require('../lib/dev'),
	{exturl} = require('../lib/exturl'),
	{run, dry} = require('../config/extLink');
const {geuquery} = run;

const api = new Api(user, pin, url, true),
	chat = new Interface(),
	protectedPages = [923, 270_566],
	[,,, geulimit] = process.argv;

(async () => {
	let mode = runMode('redry');
	if (mode === 'run') {
		mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'redry') {
		await api.massEdit(null, mode);
		return;
	} else if (mode === 'rerun') {
		const newtimestamps = await api.massEdit(null, mode, '自动修复http链接');
		const archived = require('../config/broken');
		await Promise.all([
			save('../config/broken.json', {...archived, ...newtimestamps}),
			dry ? save('../config/extLink.json', {run: {geuquery, ...dry}}) : null,
		]);
		return;
	}
	if (geulimit) {
		run.geulimit = geulimit;
	}
	const [pages, c] = await api.extSearch(run),
		editable = pages.filter(({pageid}) => !protectedPages.includes(pageid));
	let edits = [];
	if (editable.length > 0) { // 否则直接跳过，记录euoffset
		edits = await exturl(editable, chat);
		await api.massEdit(edits, mode, '自动修复http链接');
	}
	if (c === undefined) {
		info('已全部检查完毕！');
	} else {
		if (mode === 'dry') {
			info(`下次检查从 ${c.geuoffset} 开始。`);
		}
		await save(
			'../config/extLink.json',
			mode === 'dry' && edits.length > 0 ? {run, dry: c} : {run: {geuquery, ...c}},
		);
	}
})();
