/** @file 仅用于为API请求提供Promise界面 */
'use strict';
const {isObject, sleep, info} = require('./dev'),
	{cookies} = require('../config/user');

// 更新cookie字符串
const getCookie = session => Object.entries(session).map(([key, val]) => `${key}=${val}`).join('; ');

// 移除无用的对象键
const normalizeKeys = obj => {
	for (const key in obj) {
		const val = obj[key];
		if (val === undefined || val === false) {
			delete obj[key];
		} else if (Array.isArray(val)) {
			obj[key] = val.join('|');
		}
	}
	return obj;
};

class HttpError extends Error {
	constructor(message, statusCode, body) {
		super(message);
		this.name = 'HttpError';
		this.statusCode = statusCode;
		this.body = body;
		Error.captureStackTrace(this, this.constructor);
	}
}

class Request {
	url;
	cookie;

	constructor(url, useCookie) {
		if (typeof url !== 'string') {
			throw new TypeError('网址应为字符串！');
		}
		this.url = url;
		this.cookie = useCookie ? {...cookies} : {};
	}

	/**
	 * 处理请求响应的回调函数
	 * @param {Promise<Response>} promise
	 * @param {'get' | 'post'} method
	 * @param {object} params
	 * @param {number} start
	 * @returns {Promise<unknown>}
	 */
	async #callback(promise, method, params, start) {
		try {
			const response = await promise,
				isJson = response.headers.get('content-type')?.includes('application/json');
			let body = null;
			if (!response.ok || !isJson) {
				if (isJson) {
					try {
						body = await response.json();
					} catch {
						body = await response.text();
					}
				} else {
					body = await response.text();
				}
				throw new HttpError(`HTTP错误 ${response.status}`, response.status, body);
			}
			for (const header of response.headers.getSetCookie()) {
				const [cookie] = header.split(';', 1),
					equal = cookie.indexOf('=');
				if (equal !== -1) {
					this.cookie[cookie.slice(0, equal).trim()] = cookie.slice(equal + 1).trim();
				}
			}
			const r = await response.json();
			if (r.errors) {
				throw new Error('API错误', {cause: r.errors});
			}
			return r;
		} catch (e) {
			const upper = method.toUpperCase();
			if (e instanceof HttpError) {
				const {statusCode, body} = e;
				if (typeof body === 'string' && /Web\s*应用防火墙|\bWafCaptcha\b/u.test(body)) {
					info(`${upper}请求触发WAF，5分钟后将再次尝试。`);
					await sleep(300);
					return this[method](params, start);
				} else if (typeof body === 'string' && body.includes('正在维护')) {
					throw new Error('正在维护'); // eslint-disable-line preserve-caught-error
				} else if ([500, 502, 504].includes(statusCode)) {
					info(`${upper}请求触发错误代码 ${e.statusCode}，30秒后将再次尝试。`);
					await sleep(30);
					return this[method](params, start);
				}
			} else if (e.cause?.code === 'ECONNRESET') {
				info(`${upper}请求连接被重置，5分钟后将再次尝试。`);
				await sleep(300);
				return this[method](params, start);
			}
			console.error(params);
			throw e;
		}
	}

	/**
	 * GET请求
	 * @param {object} params
	 * @param {number} start
	 */
	get(params, start = Date.now()) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		} else if (Date.now() - start > 1e3 * 60 * 30) {
			throw new Error('请求超时！');
		}
		const qs = {
			action: 'query',
			format: 'json',
			formatversion: 2,
			errorformat: 'plaintext',
			uselang: 'zh-cn',
			...normalizeKeys(params),
		};
		return this.#callback(
			fetch(`${this.url}?${new URLSearchParams(qs)}`, {
				headers: {cookie: getCookie(this.cookie)},
			}),
			'get',
			params,
			start,
		);
	}

	/**
	 * POST请求
	 * @param {object} params
	 * @param {number} start
	 */
	post(params, start = Date.now()) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		} else if (Date.now() - start > 1e3 * 60 * 30) {
			throw new Error('请求超时！');
		}
		const form = new FormData();
		form.append('format', 'json');
		form.append('formatversion', '2');
		form.append('errorformat', 'plaintext');
		form.append('uselang', 'zh-cn');
		for (const [key, val] of Object.entries(normalizeKeys(params))) {
			form.append(key, val);
		}
		if (params.action === 'edit') {
			form.append('bot', '1');
		}
		return this.#callback(
			fetch(this.url, {
				method: 'POST',
				body: form,
				headers: {cookie: getCookie(this.cookie)},
			}),
			'post',
			params,
			start,
		);
	}
}

module.exports = Request;
