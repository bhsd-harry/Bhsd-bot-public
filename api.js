/**
 * @Function: 仅用于标准的MediaWiki API访问方法
 */
'use strict';
const Rp = require('./request-promise.js'),
	dev = require('./dev.js'),
	{promises: fs} = require('fs');

// 生成标准的分类名称
const _getCategoryTitle = (title) => /^(?:category|分[类類]):/i.test(title) ? title : `Category:${title}`;

class Api {
	#user;
	#pin;
	#rp;
	#login = false;
	#token = '+\\';

	constructor(user, pin, url) {
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
	}

	// 手动标记csrftoken过期
	revokeToken() {
		this.#token = '+\\';
	}

	// 登入
	async login() {
		if (this.#login) {
			return;
		}
		const {query: {tokens: {logintoken: lgtoken}}} = await this.#rp.get({meta: 'tokens', type: 'login'});
		const {login} = await this.#rp.post({action: 'login', lgname: this.#user, lgpassword: this.#pin, lgtoken});
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
		const {query: {tokens: {csrftoken}}} = await this.#rp.get({meta: 'tokens'});
		this.#token = csrftoken;
		return csrftoken;
	}

	// 编辑
	async edit(form) {
		if (!dev.isObject(form)) {
			throw new TypeError('需要对象参数！');
		}
		if (this.#token === '+\\') {
			throw '尚未获得csrftoken！';
		}
		form = {action: 'edit', tags: 'Bot', nocreate: 1, summary: '测试性编辑', token: this.#token, ...form};
		const {error, edit} = await this.#rp.post(form);
		if (error) {
			dev.error(error);
			throw error.code;
		}
		dev.info(edit);
	}

	// 批量编辑，此函数不应手动执行
	async massEdit(list, mode, summary) {
		if (mode !== 'dry') {
			return Promise.all(list.map(async ([pageid,, text], t) => {
				await dev.sleep(t);
				return this.edit({pageid, text, summary: `${summary}，如有错误请联系[[User talk:Bhsd|用户Bhsd]]`});
			}));
		}
		(await Promise.all(list.map(async ([pageid, content, text], i) => {
			await Promise.all([fs.writeFile(`oldcontent${i}`, content), fs.writeFile(`newcontent${i}`, text)]);
			const diff = await dev.cmd(`diff oldcontent${i} newcontent${i}`);
			dev.cmd(`rm oldcontent${i} newcontent${i}`);
			return [pageid, diff];
		}))).forEach(([pageid, diff]) => {
			dev.info(`${pageid}:`);
			console.log(diff);
		});
	}

	async #revisions(params) {
		const qs = {prop: 'revisions', rvprop: 'contentmodel|content', converttitles: 1, ...params},
			{query, continue: c} = await this.#rp.get(qs);
		if (!query) {
			return [[], c];
		}
		const pages = query.pages.filter(({revisions}) => revisions && revisions[0].contentmodel === 'wikitext')
			.map(({pageid, revisions}) => ({pageid, content: revisions[0].content}));
		return [pages, c];
	}

	async #recursiveRevisions(qs, pages) {
		if (!dev.isObject(qs)) {
			throw new TypeError('需要对象参数！');
		}
		if (!Array.isArray(pages)) {
			throw new TypeError('第二个可选参数应为数组！');
		}
		const [newpages, c] = await this.#revisions(qs);
		pages = [...pages, ...newpages];
		if (!c) {
			return pages;
		}
		return this.#recursiveRevisions({...qs, ...c}, pages);
	}

	categorymembers(gcmtitle) {
		if (typeof gcmtitle !== 'string') {
			throw new TypeError('目标分类应为字符串！');
		}
		gcmtitle = _getCategoryTitle(gcmtitle);
		const qs = {
			generator: 'categorymembers', gcmtitle, gcmlimit: 50, gcmnamespace: '0|9|10|11|12|13|14|15|275|829'
		};
		return this.#recursiveRevisions(qs, []);
	}

	search(gsrsearch) {
		if (typeof gsrsearch !== 'string') {
			throw new TypeError('查询条件应为字符串！');
		}
		const qs = {generator: 'search', gsrsearch, gsrlimit: 50, gsrnamespace: '0', gsrprop: ''};
		return this.#recursiveRevisions(qs, []);
	}

	async #recursiveList(qs, pageids) {
		if (!dev.isObject(qs)) {
			throw new TypeError('需要对象参数！');
		}
		if (!qs.list) {
			throw new RangeError('必需list属性！');
		}
		if (!Array.isArray(pageids)) {
			throw new TypeError('第二个可选参数应为数组！');
		}
		const {query: {[qs.list]: pages}, continue: c} = await this.#rp.get(qs);
		pageids = [...pageids, ...pages.map(({pageid}) => pageid)];
		if (!c) {
			return pageids;
		}
		return this.#recursiveList({...qs, ...c}, pages);
	}

	onlyCategorymembers(cmtitle) {
		if (typeof cmtitle !== 'string') {
			throw new TypeError('目标分类应为字符串！');
		}
		cmtitle = _getCategoryTitle(cmtitle);
		const qs = {list: 'categorymembers', cmlimit: 'max', cmtitle, cmnamespace: '0|9|11|12|13|14|15|275|829'};
		return this.#recursiveList(qs, []);
	}

	async parse(params) {
		if (!dev.isObject(params)) {
			throw new TypeError('需要对象参数！');
		}
		if (params.text) {
			params.contentmodel = 'wikitext';
		}
		const qs = {action: 'parse', prop: 'wikitext|parsewarnings', ...params},
			{parse: {wikitext, parsewarnings}} = await this.#rp.get(qs);
		return [wikitext, parsewarnings];
	}
}

module.exports = Api;