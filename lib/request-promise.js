/* eslint-disable promise/prefer-await-to-then */
/** @file 仅用于为API请求提供Promise界面 */
'use strict';
const request = require('@cypress/request').defaults({jar: true});
const {isObject, sleep, info} = require('./dev'),
	{cookies} = require('../config/user');
const cookie = Object.entries(cookies).map(([key, val]) => `${key}=${val}`).join('; ');

// 移除无用的对象键
const normalizeKeys = obj => {
	for (const [key, val] of Object.entries(obj)) {
		if (val === undefined || val === false) {
			delete obj[key];
		} else if (Array.isArray(val)) {
			obj[key] = val.join('|');
		}
	}
	return obj;
};

const callback = (resolve, reject) => function(e, response, body) {
	if (e) {
		if (response?.statusCode) {
			e.statusCode = response.statusCode;
		}
		reject(e);
		return;
	}
	let r;
	try {
		r = JSON.parse(body);
	} catch {
		if (typeof body === 'string' && /Web\s*应用防火墙|\bWafCaptcha\b/u.test(body)) {
			reject('WAF');
		} else if (typeof body === 'string' && body.includes('正在维护')) {
			reject('正在维护');
		} else {
			reject({statusCode: response?.statusCode, body});
		}
		return;
	}
	if (r.errors) {
		reject(r.errors);
	} else {
		resolve(r);
	}
};

class Request {
	url;
	cookie;

	constructor(url, useCookie) {
		if (typeof url !== 'string') {
			throw new TypeError('网址应为字符串！');
		}
		this.url = url;
		this.cookie = useCookie ? cookie : undefined;
	}

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
		return new Promise((resolve, reject) => {
			request.get(
				{url: this.url, qs, ...this.cookie ? {headers: {cookie: this.cookie}} : undefined},
				callback(resolve, reject),
			);
		}).catch(async e => {
			if ([500, 502, 504].includes(e?.statusCode)) {
				info(`GET请求触发错误代码 ${e.statusCode}，30秒后将再次尝试。`);
				await sleep(30);
				return this.get(params, start);
			} else if (e === 'WAF') {
				info('GET请求触发WAF，5分钟后将再次尝试。');
				await sleep(300);
				return this.get(params, start);
			} else if (e?.code === 'ECONNRESET') {
				await sleep(300);
				return this.get(params, start);
			}
			throw e;
		});
	}

	post(params, start = Date.now()) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		} else if (Date.now() - start > 1e3 * 60 * 30) {
			throw new Error('请求超时！');
		}
		const form = {
			format: 'json',
			formatversion: 2,
			errorformat: 'plaintext',
			uselang: 'zh-cn',
			...normalizeKeys(params),
		};
		if (params.action === 'edit') {
			form.bot = 1;
		}
		return new Promise((resolve, reject) => {
			request.post(
				{url: this.url, form, ...this.cookie ? {headers: {cookie: this.cookie}} : undefined},
				callback(resolve, reject),
			);
		}).catch(async e => {
			if ([500, 502, 504].includes(e?.statusCode)) {
				info(`POST请求触发错误代码 ${e.statusCode}，30秒后将再次尝试。`);
				await sleep(30);
				return this.post(params, start);
			} else if (e === 'WAF') {
				info('POST请求触发WAF，5分钟后将再次尝试。');
				await sleep(300);
				return this.post(params, start);
			} else if (e.code === 'ECONNRESET') {
				await sleep(300);
				return this.post(params, start);
			}
			throw e;
		});
	}
}

module.exports = Request;
