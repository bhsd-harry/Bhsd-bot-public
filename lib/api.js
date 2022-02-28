/**
 * @Function: 仅用于标准的MediaWiki API访问方法
 */
'use strict';
const Rp = require('./request-promise.js'),
	{error, isObject, sleep, save, diff, cmd, info} = require('./dev.js'),
	{promises: fs} = require('fs');

// 转换为UTC时间
const _convertToUtc = (str) => {
	if (str === undefined) {
		return;
	} else if (typeof str !== 'string') {
		throw new TypeError('时间戳应为字符串！');
	}
	return new Date(str).toISOString(); // 无效的时间戳会自动抛出RangeError
};

// 生成标准的分类名称
const _getCategoryTitle = (title) => /^(?:category|分[类類]):/i.test(title) ? title : `Category:${title}`;

class Api {
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
		const {query: {tokens: {csrftoken}}} = await this.get({meta: 'tokens'});
		this.#token = csrftoken;
		return csrftoken;
	}

	// 编辑
	async edit(params) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		}
		if (this.#token === '+\\') {
			throw '尚未获得csrftoken！';
		}
		const form = {
			action: 'edit', nocreate: 1, summary: '测试性编辑', token: this.#token, ...params,
			tags: this.url === 'https://llwiki.org/mediawiki/api.php' ? undefined : 'Bot'
		};
		const {errors, edit} = await this.post(form);
		if (errors) {
			error(errors[0]);
			throw errors[0].code;
		}
		delete edit.contentmodel;
		delete edit.oldrevid;
		delete edit.newrevid;
		delete edit.newtimestamp;
		console.log(edit);
	}

	// 批量编辑，此函数不应手动执行
	async massEdit(list, mode, summary) {
		if (mode !== 'dry') {
			if (mode === 'rerun') {
				list = require('../config/dry.json'); // eslint-disable-line no-param-reassign
			}
			if (!Array.isArray(list)) {
				throw new TypeError('编辑数据应为数组！');
			}
			return Promise.all(list.map(async ([pageid,, text], t) => {
				await sleep(t);
				try {
					await this.edit({pageid, text, summary: `${summary}，如有错误请联系[[User talk:Bhsd|用户Bhsd]]`});
				} catch { // 防止一次编辑出错就打断整个流程
					error(`页面 ${pageid} 编辑失败！`);
				}
			}));
		}
		save('../../Bhsd-bot-public/config/dry.json', list.map(([pageid,, text]) => [pageid, null, text]));
		(await Promise.all(list.map(async ([pageid, content, text], i) => {
			await Promise.all([fs.writeFile(`oldcontent${i}`, content), fs.writeFile(`newcontent${i}`, text)]);
			const diffOut = await diff(`oldcontent${i}`, `newcontent${i}`);
			cmd(`rm oldcontent${i} newcontent${i}`);
			return [pageid, diffOut];
		}))).forEach(([pageid, diffOut]) => {
			info(`${pageid}:`);
			console.log(diffOut);
		});
	}

	async #revisions(params) {
		const qs = {prop: 'revisions', rvprop: 'contentmodel|content', converttitles: 1, ...params},
			{query, continue: c} = await this.get(qs);
		if (!query?.pages) {
			return [[], c];
		}
		const pages = query.pages.filter(({revisions}) => revisions && revisions[0].contentmodel === 'wikitext')
			.map(({pageid, revisions: [{content}]}) => ({pageid, content})).filter(({pageid, content}) => {
				if (/{{[\s\u200e]*(?:[Ii]nuse|施工中|编辑中)/.test(content)) {
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
			generator: 'exturlusage', geulimit: 50, geunamespace: '0|10|12|14|828', geuprotocol: 'http', ...params
		};
		return this.#revisions(qs);
	}

	async #recursiveRevisions(qs, pages = []) {
		if (!isObject(qs)) {
			throw new TypeError('需要对象参数！');
		}
		if (!Array.isArray(pages)) {
			throw new TypeError('第二个可选参数应为数组！');
		}
		const [newpages, c] = await this.#revisions(qs);
		pages = [...pages, ...newpages]; // eslint-disable-line no-param-reassign
		if (!c) {
			return pages;
		}
		return this.#recursiveRevisions({...qs, ...c}, pages);
	}

	revisions(pageids) {
		return this.#recursiveRevisions({pageids});
	}

	categorymembers(gcmtitle) {
		if (typeof gcmtitle !== 'string') {
			throw new TypeError('目标分类应为字符串！');
		}
		gcmtitle = _getCategoryTitle(gcmtitle); // eslint-disable-line no-param-reassign
		const qs = {
			generator: 'categorymembers', gcmtitle, gcmlimit: 500, gcmnamespace: '0|3|9|10|11|12|13|14|15|275|829'
		};
		return this.#recursiveRevisions(qs);
	}

	search(gsrsearch) {
		if (typeof gsrsearch !== 'string') {
			throw new TypeError('查询条件应为字符串！');
		}
		const qs = {generator: 'search', gsrsearch, gsrlimit: 500, gsrnamespace: '0|10|12'};
		return this.#recursiveRevisions(qs);
	}

	taggedRecentChanges(grctag, grcend) {
		if (typeof grctag !== 'string') {
			throw new TypeError('标签应为字符串！');
		}
		const qs = {
			generator: 'recentchanges', grcnamespace: '0|10|12|14|828', grctag, grclimit: 500, grctype: 'edit|new',
			grcexcludeuser: 'Bhsd', grcend
		};
		return this.#recursiveRevisions(qs);
	}

	async #recursiveList(qs, pageids = []) {
		if (!isObject(qs)) {
			throw new TypeError('需要对象参数！');
		}
		if (!qs.list) {
			throw new RangeError('必需list属性！');
		}
		if (!Array.isArray(pageids)) {
			throw new TypeError('第二个可选参数应为数组！');
		}
		const {query: {[qs.list]: pages}, continue: c} = await this.get(qs);
		// eslint-disable-next-line no-param-reassign
		pageids = [...pageids, ...pages.map(({pageid, title}) => ({pageid, title}))];
		if (!c) {
			return pageids;
		}
		return this.#recursiveList({...qs, ...c}, pages);
	}

	onlyCategorymembers(cmtitle) {
		if (typeof cmtitle !== 'string') {
			throw new TypeError('目标分类应为字符串！');
		}
		cmtitle = _getCategoryTitle(cmtitle); // eslint-disable-line no-param-reassign
		const qs = {list: 'categorymembers', cmlimit: 'max', cmtitle, cmnamespace: '0|3|9|11|12|13|14|15|275|829'};
		return this.#recursiveList(qs);
	}

	async #recentChanges(params, rcl = []) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		}
		if (!Array.isArray(rcl)) {
			throw new TypeError('第二个可选参数应为数组！');
		}
		const qs = {
				curtimestamp: 1, list: 'recentchanges', rcdir: 'newer', rclimit: 'max',
				rcprop: 'user|comment|flags|timestamp|title|ids|sizes|redirect|loginfo|tags', ...params
			},
			{query: {recentchanges}, curtimestamp, continue: c} = await this.get(qs);
		rcl = [...rcl, ...recentchanges]; // eslint-disable-line no-param-reassign
		if (!c) {
			const rcend = params.rcend || curtimestamp;
			info(`${this.site}已检查至 ${rcend}`);
			return [rcl, rcend];
		}
		return this.#recentChanges({...params, ...c}, rcl);
	}

	recentChanges(rcstart, rcend) {
		try {
			rcstart = _convertToUtc(rcstart); // eslint-disable-line no-param-reassign
			rcend = _convertToUtc(rcend); // eslint-disable-line no-param-reassign
			return this.#recentChanges({rcstart, rcend});
		} catch {
			throw new TypeError('无效时间戳！');
		}
	}

	async #recentChangesInCategories(params, cats, rcl = []) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		}
		/* eslint-disable no-param-reassign */
		if (Array.isArray(cats)) {
			cats = cats.map(_getCategoryTitle);
		} else if (typeof cats === 'string') {
			cats = [_getCategoryTitle(cats)];
		} else {
			throw new TypeError('分类参数应为数组或字符串！');
		}
		/* eslint-enable no-param-reassign */
		if (!Array.isArray(rcl)) {
			throw new TypeError('第三个可选参数应为数组！');
		}
		const qs = {
			curtimestamp: 1, list: 'recentchanges', rcdir: 'newer', rclimit: 500,
			rcprop: 'user|comment|flags|timestamp|title|ids|sizes|redirect|loginfo|tags', prop: 'categories',
			generator: 'recentchanges', grcdir: 'newer', grclimit: 500, clshow: '!hidden', cllimit: 'max', ...params
		};
		const {query: {pages = [], recentchanges = []}, curtimestamp, continue: c} = await this.get(qs);
		const relatedPages = pages.filter(({categories = []}) => categories.some(cat => cats.includes(cat.title)))
			.map(({title}) => title);
		rcl = [...rcl, ...recentchanges.filter(({title, logparams}) => // eslint-disable-line no-param-reassign
			relatedPages.includes(title) || relatedPages.includes(logparams?.target_title)
		)];
		if (!c) {
			const rcend = params.rcend || curtimestamp;
			info(`${this.site}已检查至 ${rcend}`);
			return [rcl, rcend];
		}
		return this.#recentChangesInCategories({...params, ...c}, cats, rcl);
	}

	recentChangesInCategories(cats, rcstart, rcend, params = {}) {
		if (!isObject(params)) {
			throw new TypeError('第四个可选参数应为对象！');
		}
		try {
			rcstart = _convertToUtc(rcstart); // eslint-disable-line no-param-reassign
			rcend = _convertToUtc(rcend); // eslint-disable-line no-param-reassign
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
		}
		if (!Array.isArray(ext)) {
			throw new TypeError('第二个可选参数应为数组！');
		}
		const qs = {
				list: 'exturlusage', euprop: 'ids|url', euprotocol: 'http', eulimit: 'max', euexpandurl: 1,
				eunamespace: '0|4|6|8|10|12|14|274|828', ...params
			},
			{query: {exturlusage}, continue: c} = await this.get(qs);
		ext = [...ext, ...exturlusage]; // eslint-disable-line no-param-reassign
		if (!c) {
			return ext;
		}
		return this.extUrl({...params, ...c}, ext);
	}
}

module.exports = Api;