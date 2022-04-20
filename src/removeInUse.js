const Api = require('../lib/api'),
	{runMode, parse, error} = require('../lib/dev'),
	{user, pin, url} = require('../config/user');

const age = 1000 * 86400 * 7, // 一周
	inuse = ['Template:Inuse', 'Template:施工中', 'Template:编辑中', 'Template:編輯中'],
	zhnum = {半: '.5', 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9},
	unit = {天: 1440, 日: 1440, 小时: 60, 小時: 60, 时: 60, 時: 60, 钟头: 60, 鐘頭: 60, 分钟: 1, 分鐘: 1, 分: 1};

const _parseTime = token => {
	const fallback = 2 * 1440,
		until = token.parameters['直到'],
		last = token.parameters['持续时间'] ?? token.parameters[1] ?? '2小时';
	if (until) {
		error(`无法解析的参数：直到 ${until}`);
		return fallback;
	}
	const lapse = last.replace(/[\s个個]/g, '').replace(/[半零〇一二两兩三四五六七八九]/g, m => zhnum[m])
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

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	if (!module.parent) {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode === 'rerun') {
			await api.massEdit(null, mode, '自动移除超时的[[template:施工中|施工中]]模板');
			return;
		}
	}
	const list = await api.categorymembers('正在编辑的条目', {rvdir: 'newer', rvlimit: 1, rvprop: 'timestamp'});
	const pageids = list.filter(({timestamp}) => Date.now() - new Date(timestamp).getTime() > age)
		.map(({pageid}) => pageid);
	if (pageids.length === 0) {
		return;
	}
	const pages = await api.revisions({pageids, inuse: true});
	const edits = pages.map(({pageid, content, timestamp, curtimestamp}) => {
		const parsed = parse(content);
		parsed.each('transclusion', token => {
			if (!inuse.includes(token.page_title)) {
				return;
			}
			const time = _parseTime(token) * 60;
			if (new Date(timestamp).getTime() + time < Date.now()) {
				token.toString = () => '';
			}
		});
		const text = parsed.toString();
		return text === content ? null : [pageid, content, text, timestamp, curtimestamp];
	}).filter(page => page);
	await api.massEdit(edits, mode, '自动移除超时的[[template:施工中|施工中]]模板');
};

if (!module.parent) {
	main();
}

module.exports = main;
