/**
 * @Function: 仅用于为API请求提供Promise界面
 */
'use strict';
const request = require('request').defaults({jar: true}),
	{isObject, sleep, info} = require('./dev');

// 移除无用的对象键
const _normalizeKeys = obj => {
	Object.entries(obj).forEach(([key, val]) => {
		if (val === undefined) {
			delete obj[key];
		} else if (Array.isArray(val)) {
			obj[key] = val.join('|');
		}
	});
	return obj;
};

const _callback = (resolve, reject) => {
	return function(e, response, body) {
		if (e) {
			if (response?.statusCode) {
				e.statusCode = response.statusCode;
			}
			reject(e);
		}
		try {
			resolve(JSON.parse(body));
		} catch {
			if (typeof body === 'string' && /Web应用防火墙|\bWafCaptcha\b/.test(body)) {
				reject('WAF');
			}
			reject({statusCode: response?.statusCode, body});
		}
	};
};

class Request {
	url;

	constructor(url) {
		if (typeof url !== 'string') {
			throw new TypeError('网址应为字符串！');
		}
		this.url = url;
	}

	get(params) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		}
		const qs = {
			action: 'query', format: 'json', formatversion: 2, errorformat: 'plaintext', uselang: 'zh-cn',
			..._normalizeKeys(params),
		};
		return new Promise((resolve, reject) => {
			request.get({url: this.url, qs}, _callback(resolve, reject));
		}).catch(async e => {
			if ([500, 502, 504].includes(e?.statusCode)) {
				info(`GET请求触发错误代码 ${e.statusCode}，30秒后将再次尝试。`);
				await sleep(30);
				return this.get(params);
			} else if (e === 'WAF') {
				info(`GET请求触发WAF，5分钟后将再次尝试。`);
				await sleep(300);
				return this.get(params);
			}
			throw e;
		});
	}

	post(params) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		}
		const form = {
			bot: 1, format: 'json', formatversion: 2, errorformat: 'plaintext', uselang: 'zh-cn',
			..._normalizeKeys(params),
		};
		return new Promise((resolve, reject) => {
			request.post({url: this.url, form}, _callback(resolve, reject));
		}).catch(async e => {
			if ([500, 502, 504].includes(e?.statusCode)) {
				info(`POST请求触发错误代码 ${e.statusCode}，30秒后将再次尝试。`);
				await sleep(30);
				return this.post(params);
			} else if (e === 'WAF') {
				info(`POST请求触发WAF，5分钟后将再次尝试。`);
				await sleep(300);
				return this.post(params);
			}
			throw e;
		});
	}
}

module.exports = Request;
