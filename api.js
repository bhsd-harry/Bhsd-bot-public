/**
 * @Function: 仅用于标准的MediaWiki API访问方法
 */
'use strict';
const Rp = require('./request-promise.js'),
	dev = require('./dev.js');

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

	// 获取logintoken
	async #loginToken() {
		const {query: {tokens: {logintoken}}} = await this.#rp.get({meta: 'tokens', type: 'login'});
		return logintoken;
	}

	// login
	async login() {
		if (this.#login) {
			return;
		}
		const lgtoken = await this.#loginToken();
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
	async #edit(form) {
		if (this.#token === '+\\') {
			throw '尚未获得csrftoken！';
		}
		form = {action: 'edit', assert: 'bot', nocreate: 1, summary: '测试性编辑', ...form};
		const {error, edit} = await this.#rp.post(form);
		if (error) {
			dev.error(error);
			throw error.code;
		}
		dev.info(edit);
	}

	// 检查输入参数并编辑
	edit(form) {
		if (!dev.isObject(form)) {
			throw new TypeError('需要对象参数！');
		}
		return this.#edit(form);
	}

	async #revisions(params) {
		const qs = {prop: 'revisions', rvprop: 'contentmodel|content', converttitles: 1, ...params},
			res = await this.#rp.get(qs);
		const {query, continue: c} = res;
		if (!query) {
			return [[], c];
		}
		const pages = query.pages.filter(({revisions}) => revisions && revisions[0].contentmodel === 'wikitext')
			.map(({pageid, revisions}) => ({pageid, content: revisions[0].content}));
		return [pages, c];
	}

	async #categorymembers(qs, pages) {
		const [newpages, c] = await this.#revisions(qs);
		pages = [...pages, ...newpages];
		if (!c) {
			return pages;
		}
		return this.#categorymembers({...qs, ...c}, pages);
	}

	categorymembers(gcmtitle, pages = []) {
		if (typeof gcmtitle !== 'string') {
			throw new TypeError('目标分类应为字符串！');
		}
		if (!Array.isArray(pages)) {
			throw new TypeError('第二个可选参数应为数组！');
		}
		const qs = {generator: 'categorymembers', gcmtitle, gcmlimit: 50, gcmnamespace: '0|9|10|11|12|13|14|15|275|829'};
		return this.#categorymembers(qs, pages);
	}
}

module.exports = Api;