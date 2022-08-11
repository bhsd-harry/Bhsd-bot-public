'use strict';
const Api = require('../lib/api'),
	{runMode, info, save, sleep} = require('../lib/dev'),
	{user, pin, url, owner, ownerpin} = require('../config/user');

const mode = runMode();

if (mode === 'dry') {
	(async () => {
		const api = new Api(user, pin, url),
			[,,, mistake = 403] = process.argv,
			mistakes = {
				403: '-403 - 访问权限不足',
				62003: '62003 - 稿件已审核通过，等待发布中',
			};
		await api.login();
		const {query: {usercontribs}} = await api.get({
			list: 'usercontribs', uclimit: 'max', ucuser: 'AnnAngela-abot', ucnamespace: 0, ucprop: 'ids|comment',
			uctag: '发现失效视频',
		});
		const uc = usercontribs
				.filter(({comment}) => new RegExp(`^发现失效视频：(?:\\w+: ${mistakes[mistake]}、?)+$`).test(comment)),
			pageids = uc.map(({pageid}) => pageid);
		const pages = await api.revisions({
			pageids, prop: 'categories|revisions', cllimit: 'max',
			clcategories: 'Category:带有失效视频的条目|Category:带有受限视频的条目',
		});
		const edits = pages.filter(({categories}) =>
			categories && categories.some(({title}) => title === 'Category:带有失效视频的条目'),
		).map(({pageid, content, timestamp, curtimestamp, categories}) =>
			[
				pageid, content,
				content.replace(/\n\[\[Category:带有失效视频的条目]]/g, '')
					+ (mistake === 403 && categories.length === 1 ? '\n[[Category:带有受限视频的条目]]' : ''),
				timestamp, curtimestamp,
			],
		);
		await api.massEdit(edits, 'dry');
	})();
} else if (mode === 'rerun') {
	(async () => {
		const dry = require('../config/dry'),
			api = new Api(owner, ownerpin, url);
		await api.csrfToken();
		const edit = async loop => {
			const [pageid,, text, basetimestamp, starttimestamp] = dry.at(-1);
			try {
				await api.edit({pageid, text, basetimestamp, starttimestamp, summary: undefined});
				dry.pop();
				if (loop && dry.length) {
					info(`下一次编辑页面 ${dry.at(-1)[0]} 将在1分钟后。`);
					await sleep(60);
					return edit(true);
				}
			} catch (e) {
				await save('../config/dry.json', dry);
				throw e;
			}
		};
		await edit(true);
	})();
}
