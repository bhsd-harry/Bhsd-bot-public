/**
 * @Function: 仅用于标准的MediaWiki API访问方法
 */
'use strict';
const Rp = require('./request-promise'),
	{error, isObject, save, diff, info, sleep} = require('./dev');

// 转换为UTC时间
const _convertToUtc = str => {
	if (str === undefined) {
		return;
	} else if (typeof str !== 'string') {
		throw new TypeError('时间戳应为字符串！');
	}
	return new Date(str).toISOString(); // 无效的时间戳会自动抛出RangeError
};

// 生成标准的分类名称
const _getCategoryTitle = title => /^(?:category|分[类類]):/i.test(title) ? title : `Category:${title}`;

class Api {
	user;
	url;
	site;
	#user;
	#pin;
	#rp;
	#login = false;
	#token = '+\\';

	constructor(user, pin, url, site) {
		if (typeof user !== 'string') {
			throw new TypeError('用户名应为字符串！');
		} else if (typeof pin !== 'string') {
			throw new TypeError('密码应为字符串！');
		} else if (typeof url !== 'string') {
			throw new TypeError('网址应为字符串！');
		}
		[this.user] = user.split('@', 1);
		this.#user = user;
		this.#pin = pin;
		this.#rp = new Rp(`${url.replace(/api\.php$/i, '').replace(/\/$/, '')}/api.php`);
		this.url = this.#rp.url;
		this.site = site;
	}

	// 手动标记登出
	logout() {
		this.#login = false;
	}

	// 手动标记csrftoken过期
	revokeToken() {
		this.#token = '+\\';
	}

	get(qs) {
		return this.#rp.get(qs);
	}

	post(form) {
		return this.#rp.post(form);
	}

	// 登入
	async login() {
		if (this.#login) {
			return;
		}
		const {query: {tokens: {logintoken: lgtoken}}} = await this.get({meta: 'tokens', type: 'login'});
		const {login} = await this.post({action: 'login', lgname: this.#user, lgpassword: this.#pin, lgtoken});
		console.log(login);
		this.#login = true;
		this.revokeToken();
	}

	// 获取csrftoken
	async csrfToken() {
		await this.login();
		if (this.#token !== '+\\') {
			return this.#token;
		}
		let {query: {tokens: {csrftoken}}} = await this.get({meta: 'tokens'});
		if (csrftoken === '+\\') {
			this.logout();
			await this.login();
			({query: {tokens: {csrftoken}}} = await this.get({meta: 'tokens'}));
		}
		this.#token = csrftoken;
		return csrftoken;
	}

	// 编辑
	async edit(params) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		} else if (this.#token === '+\\') {
			throw '尚未获得csrftoken！';
		}
		const form = {
			action: 'edit', nocreate: 1, minor: 1, summary: '测试性编辑', token: this.#token,
			tags: this.url === 'https://llwiki.org/mediawiki/api.php' || this.user !== 'Bhsd-bot'
				? undefined
				: 'Bot',
			...params,
		};
		const {errors, edit} = await this.post(form);
		if (errors?.[0]?.code === 'internal_api_error_DBConnectionError') {
			info(`页面 ${params.pageid || params.title} 编辑时数据库错误，30秒后将再次尝试。`);
			await sleep(30);
			return this.edit(params);
		} else if (errors?.[0]?.code === 'badtoken') {
			this.revokeToken();
			await this.csrfToken();
			return this.edit(params);
		} else if (errors?.[0]?.code === 'ratelimited') {
			info(`页面 ${params.pageid || params.title} 编辑时超出频率限制，5分钟后将再次尝试。`);
			await sleep(300);
			return this.edit(params);
		} else if (errors) {
			console.error(errors[0]);
			error(`页面 ${params.pageid || params.title} 编辑失败！`);
			return;
		}
		delete edit.contentmodel;
		delete edit.oldrevid;
		delete edit.newrevid;
		const {newtimestamp} = edit;
		delete edit.newtimestamp;
		console.log(edit);
		return !edit.nochange && newtimestamp;
	}

	// 新重定向
	redirect(title, target, mode, summary = '机器人重定向') {
		if (mode === 'dry') {
			console.log(`* [[${title}]] -> [[${target}]]`);
		}
		return this.edit({nocreate: undefined, createonly: 1, summary, title, text: `#重定向 [[${target}]]`});
	}

	// 批量编辑，此函数不应手动执行
	async massEdit(list, mode, summary) {
		if (mode !== 'dry') {
			if (mode === 'rerun' || mode === 'redry') {
				try {
					list = require(`${process.cwd()}/dry`);
				} catch (e) {
					if (e?.code !== 'MODULE_NOT_FOUND') {
						throw e;
					}
					list = [];
				}
			} else {
				await this.massEdit(list, 'dry');
			}
			if (!Array.isArray(list)) {
				throw new TypeError('编辑数据应为数组！');
			} else if (mode !== 'redry') {
				const newtimestamps = {};
				for (const [pageid,, text, basetimestamp, starttimestamp, nBroken, nArchived, nFailed] of list) {
					const [newtimestamp] = await Promise.all([
						this.edit(text === null
							? {pageid, appendtext: '', summary: '空编辑'}
							: {
								pageid, text, basetimestamp, starttimestamp,
								summary: summary + (nBroken || nArchived || nFailed
									? `，标记 ${nBroken || 0} 个${
										nArchived ? `、存档 ${nArchived} 个` : ''
									}${
										nFailed ? `、无法存档 ${nFailed} 个` : ''
									}失效链接`
									: ''
								),
							},
						),
						['ja.moegirl.org.cn', 'en.moegirl.org.cn'].includes(this.url.slice(8, -8)) ? sleep(6) : 0,
					]);
					if (newtimestamp) {
						newtimestamps[pageid] = newtimestamp;
					}
				}
				return newtimestamps;
			}
		} else if (list.length === 0) {
			return {};
		}
		const pageids = new Set(list.map(([pageid]) => pageid));
		for (const [pageid, content, text] of list) {
			if (content === null || text === null) {
				pageids.delete(pageid);
				continue;
			}
			const diffOut = await diff(content, text, true);
			if (diffOut) {
				info(`${pageid}:`);
				pageids.delete(pageid);
				console.log(diffOut);
			}
		}
		if (pageids.size) {
			error(`以下页面未能输出差异：${[...pageids].join(', ')}`);
		}
		await save(
			`${process.cwd()}/dry.json`,
			list.map(([pageid, content, ...rest]) => [pageid, pageids.has(pageid) && content, ...rest]),
		);
		return {};
	}

	nullEdit(pages) {
		const edits = pages.map(({pageid}) => [pageid, null, null]);
		return this.massEdit(edits);
	}

	async #revisions({inuse, ...params}) {
		const qs = {
				prop: 'revisions', rvprop: 'contentmodel|content|timestamp', converttitles: 1, curtimestamp: 1,
				...params,
			},
			{query, continue: c, curtimestamp} = await this.get(qs);
		if (!query?.pages) {
			return [[], c];
		}
		const pages = query.pages.filter(({revisions}) => revisions && revisions[0]?.contentmodel === 'wikitext')
			.map(page => {
				const {revisions: [{content, timestamp}]} = page;
				page.content = content;
				page.timestamp = timestamp;
				page.curtimestamp = curtimestamp;
				delete page.revisions;
				return page;
			}).filter(({pageid, content}) => {
				if (!inuse && /\{\{[\s\u200e]*(?:[Ii]nuse|施工中|[编編][辑輯]中)/.test(content)) {
					error(`已跳过施工中的页面 ${pageid} ！`);
					return false;
				}
				return true;
			});
		return [pages, c];
	}

	extSearch(params = {}) {
		if (!isObject(params)) {
			throw new TypeError('可选参数应为对象！');
		}
		const qs = {
			generator: 'exturlusage', geulimit: 20, geunamespace: '0|10|12|14|828', geuprotocol: 'http', ...params,
		};
		return this.#revisions(qs);
	}

	async #recursiveRevisions(qs, pages = [], limit = Infinity) {
		const [newpages, c] = await this.#revisions(qs);
		info(`已获取 ${newpages.length} 个页面的源代码。`);
		pages = [...pages, ...newpages];
		if (pages.length >= limit) {
			return [pages, c]; /** @type {[array, ?object]} */
		} else if (!c) {
			return limit === Infinity ? pages : [pages];
		}
		return this.#recursiveRevisions({...qs, ...c}, pages);
	}

	revisions(params = {}) {
		if (!isObject(params) || !params.pageids && !params.titles && !params.generator) {
			throw new RangeError('参数必须包含 pageids 或 titles 或 generator 属性！');
		} else if (
			Array.isArray(params.pageids) && params.pageids.length === 0
			|| typeof params.pageids === 'string' && !params.pageids
			|| Array.isArray(params.titles) && params.titles.length === 0
			|| typeof params.titles === 'string' && !params.titles
		) {
			return [];
		}
		return this.#recursiveRevisions(params);
	}

	categorymembers(gcmtitle, params = {}, limit = Infinity) {
		if (typeof gcmtitle !== 'string') {
			throw new TypeError('目标分类应为字符串！');
		} else if (!isObject(params)) {
			throw new TypeError('第二个可选参数应为对象！');
		} else if (typeof limit !== 'number') {
			throw new TypeError('第三个可选参数应为整数！');
		}
		gcmtitle = _getCategoryTitle(gcmtitle);
		const qs = {
			generator: 'categorymembers', gcmtitle, gcmnamespace: '0|1|3|9|10|11|12|13|14|15|275|829',
			gcmsort: 'timestamp', gcmlimit: Math.min(400, limit), ...params,
		};
		return this.#recursiveRevisions(qs, undefined, limit);
	}

	search(gsrsearch, params = {}) {
		if (typeof gsrsearch !== 'string') {
			throw new TypeError('查询条件应为字符串！');
		} else if (!isObject(params)) {
			throw new TypeError('第二个可选参数应为对象！');
		}
		const qs = {
			generator: 'search', gsrsearch, gsrlimit: 400, gsrnamespace: '0|3|9|10|11|12|13|14|15|275|829',
			...params,
		};
		return this.#recursiveRevisions(qs);
	}

	taggedRecentChanges(grctag, grcend) {
		if (typeof grctag !== 'string') {
			throw new TypeError('标签应为字符串！');
		}
		try {
			grcend = _convertToUtc(grcend);
		} catch {
			throw new TypeError('无效时间戳！');
		}
		const qs = {
			generator: 'recentchanges', grcnamespace: '0|10|12|14|828', grctag, grclimit: 400, grctype: 'edit|new',
			grcexcludeuser: 'Bhsd', grcend,
		};
		return this.#recursiveRevisions(qs);
	}

	async #recursiveList(qs, pageids = []) {
		const {query: {[qs.list]: pages}, continue: c} = await this.get(qs);
		pageids = [...pageids, ...pages.map(({pageid, title}) => ({pageid, title}))];
		if (!c) {
			return pageids;
		}
		return this.#recursiveList({...qs, ...c}, pages);
	}

	onlyCategorymembers(cmtitle, params = {}) {
		if (typeof cmtitle !== 'string') {
			throw new TypeError('目标分类应为字符串！');
		} else if (!isObject(params)) {
			throw new TypeError('第二个可选参数应为对象！');
		}
		cmtitle = _getCategoryTitle(cmtitle);
		const qs = {
			list: 'categorymembers', cmlimit: 400, cmtitle, cmnamespace: '0|1|3|9|11|12|13|14|15|275|829', ...params,
		};
		return this.#recursiveList(qs);
	}

	async #recentChanges(params, rcl = []) {
		const qs = {
				curtimestamp: 1, list: 'recentchanges', rcdir: 'newer', rclimit: 400,
				rcprop: 'user|comment|flags|timestamp|title|ids|sizes|redirect|loginfo|tags', ...params,
			},
			{query: {recentchanges}, curtimestamp, continue: c} = await this.get(qs);
		rcl = [...rcl, ...recentchanges];
		if (!c) {
			const rcend = params.rcend || curtimestamp;
			return [rcl, rcend];
		}
		return this.#recentChanges({...params, ...c}, rcl);
	}

	recentChanges(rcstart, rcend) {
		try {
			rcstart = _convertToUtc(rcstart);
			rcend = _convertToUtc(rcend);
			return this.#recentChanges({rcstart, rcend});
		} catch {
			throw new TypeError('无效时间戳！');
		}
	}

	async #recentChangesInCategories(params, cats, rcl = []) {
		if (Array.isArray(cats)) {
			cats = cats.map(_getCategoryTitle);
		} else if (typeof cats === 'string') {
			cats = [_getCategoryTitle(cats)];
		} else {
			throw new TypeError('分类参数应为数组或字符串！');
		}
		const qs = {
			curtimestamp: 1, list: 'recentchanges', rcdir: 'newer', rclimit: 400,
			rcprop: 'user|comment|flags|timestamp|title|ids|sizes|redirect|loginfo|tags', prop: 'categories',
			generator: 'recentchanges', grcdir: 'newer', grclimit: 400, clshow: '!hidden', cllimit: 'max', ...params,
		};
		const {query: {pages = [], recentchanges = []}, curtimestamp, continue: c} = await this.get(qs);
		const relatedPages = pages.filter(({categories = []}) => categories.some(cat => cats.includes(cat.title)))
			.map(({title}) => title);
		rcl = [...rcl, ...recentchanges.filter(({title, logparams}) =>
			relatedPages.includes(title) || relatedPages.includes(logparams?.target_title),
		)];
		if (!c) {
			const rcend = params.rcend || curtimestamp;
			return [rcl, rcend];
		}
		return this.#recentChangesInCategories({...params, ...c}, cats, rcl);
	}

	recentChangesInCategories(cats, rcstart, rcend, params = {}) {
		if (!isObject(params)) {
			throw new TypeError('第四个可选参数应为对象！');
		}
		try {
			rcstart = _convertToUtc(rcstart);
			rcend = _convertToUtc(rcend);
			const qs = {rcstart, rcend, grcstart: rcstart, grcend: rcend, ...params};
			return this.#recentChangesInCategories(qs, cats);
		} catch {
			throw new TypeError('无效时间戳！');
		}
	}

	async parse(params) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		}
		if (params.text) {
			params.contentmodel = 'wikitext';
		}
		const qs = {action: 'parse', prop: 'wikitext|parsewarnings', ...params},
			{parse: {wikitext, parsewarnings}} = await this.get(qs);
		return [wikitext, parsewarnings];
	}

	async extUrl(params = {}, ext = []) {
		if (!isObject(params)) {
			throw new TypeError('第一个可选参数应为对象！');
		} else if (!Array.isArray(ext)) {
			throw new TypeError('第二个可选参数应为数组！');
		}
		const qs = {
				list: 'exturlusage', euprop: 'ids|url', euprotocol: 'http', eulimit: 400, euexpandurl: 1,
				eunamespace: '0|4|6|8|10|12|14|274|828', ...params,
			},
			{query: {exturlusage}, continue: c} = await this.get(qs);
		ext = [...ext, ...exturlusage];
		if (!c) {
			return ext;
		}
		return this.extUrl({...params, ...c}, ext);
	}

	async embeddedIn(ei) {
		const qs = {list: 'embeddedin', einamespace: '0|10|12|14', eilimit: 'max'};
		if (typeof ei === 'number') {
			qs.eipageid = ei;
		} else if (typeof ei === 'string') {
			qs.eititle = ei;
		} else {
			throw new RangeError('参数必须为 eipageid 或 eititle！');
		}
		const {query: {embeddedin}} = await this.get(qs);
		return embeddedin;
	}
}

module.exports = Api;
