'use strict';
const Api = require('../lib/api'),
	{runMode, error, info} = require('../lib/dev'),
	Parser = require('../../wikiparser-node'),
	{user, pin, url} = require('../config/user');
Parser.warning = false;
Parser.config = './config/moegirl';

const protectedPages = [9658, 33803, 44832],
	age = 1000 * 86400 * 7, // 一周
	inuse = ['Inuse', '施工中', '编辑中', '編輯中'].map(str => `template#Template:${str}`).join(),
	zhnum = {半: '.5', 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9},
	unit = {天: 1440, 日: 1440, 小时: 60, 小時: 60, 时: 60, 時: 60, 钟头: 60, 鐘頭: 60, 分钟: 1, 分鐘: 1, 分: 1};

const _parseTime = token => {
	const fallback = 2 * 1440,
		until = token.getValue('直到');
	if (until) {
		error(`无法解析的参数：直到 ${until}`);
		return fallback;
	}
	const last = token.getValue('持续时间') ?? token.getValue(1) ?? '2小时',
		lapse = last.replace(/[\s个個]/g, '').replace(/[半零〇一二两兩三四五六七八九]/g, m => zhnum[m])
			.replace(/(\d?)十(\d?)/g, (_, p1, p2) => `${p1 || 1}${p2 || 0}`),
		args = [...lapse.matchAll(/([\d.]+)(\D+)/g)];
	if (args.map(([m]) => m).join('') !== lapse) {
		error(`无法解析的参数：持续 ${lapse}`);
		return fallback;
	}
	let time = 0;
	for (const [, n, u] of args) {
		if (!(u in unit)) {
			error(`无法解析的参数：持续 ${n}${u}`);
			return fallback;
		}
		time += n * unit[u];
	}
	return time;
};

const _format = time => {
	const minute = Math.ceil(time / 1000 / 60);
	if (minute < 60) {
		return `${minute}分`;
	}
	const hour = Math.floor(minute / 60);
	if (hour < 24) {
		return `${hour}小时${minute - hour * 60}分`;
	}
	const day = Math.floor(hour / 24);
	return `${day}天${hour - day * 24}小时${minute - hour * 60}分`;
};

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动移除超时的[[template:施工中|施工中]]模板');
			return;
		}
	}
	const pageids = (await Promise.all((await api.embeddedIn(33803))
		.filter(({pageid}) => !protectedPages.includes(pageid))
		.map(async ({pageid}) => {
			const {query: {pages: [{revisions: [{timestamp}]}]}, curtimestamp} = await api.get({
				pageids: pageid, prop: 'revisions', rvdir: 'newer', rvlimit: 1, rvprop: 'timestamp', curtimestamp: 1,
			});
			if (new Date(curtimestamp).getTime() - new Date(timestamp).getTime() > age) {
				return pageid;
			}
			return null;
		}),
	)).filter(pageid => pageid);
	if (pageids.length === 0) {
		return;
	}
	const pages = await api.revisions({pageids, inuse: true});
	const edits = pages.map(({pageid, content, timestamp, curtimestamp}) => {
		const root = Parser.parse(content, false, 2),
			templates = root.querySelectorAll(inuse);
		for (const token of templates) {
			const time = _parseTime(token) * 60 * 1000,
				remain = new Date(timestamp).getTime() + time - new Date(curtimestamp).getTime();
			if (remain < 0) {
				info(`${pageid}: 施工持续 ${_format(time)}，已超过 ${_format(-remain)}`);
				token.remove();
			} else {
				error(`${pageid}: 施工持续 ${_format(time)}，还剩 ${_format(remain)}`);
			}
		}
		const text = root.toString();
		return text === content ? null : [pageid, content, text, timestamp, curtimestamp];
	}).filter(page => page);
	await api.massEdit(edits, mode, '自动移除超时的[[template:施工中|施工中]]模板');
};

if (!module.parent) {
	main();
}

module.exports = main;
