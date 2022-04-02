/**
 * @Function: 仅用于为API请求提供Promise界面
 */
'use strict';
const request = require('request').defaults({jar: true}),
	{isObject} = require('./dev.js');

// 移除无用的对象键
const _deleteKeys = (obj) => {
	Object.entries(obj).forEach(([key, val]) => {
		if (val === undefined) {
			delete obj[key];
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
			if (typeof body === 'string' && body.includes('腾讯T-Sec Web应用防火墙')) {
				reject('WAF');
			}
			reject({statusCode: response.statusCode, body});
		}
	};
};

class Rp {
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
		return new Promise((resolve, reject) => {
			const qs = {
				action: 'query', format: 'json', formatversion: 2, errorformat: 'plaintext', uselang: 'zh-cn',
				..._deleteKeys(params),
			};
			request.get({url: this.url, qs}, _callback(resolve, reject));
		});
	}

	post(params) {
		if (!isObject(params)) {
			throw new TypeError('需要对象参数！');
		}
		return new Promise((resolve, reject) => {
			const form = {
				bot: 1, format: 'json', formatversion: 2, errorformat: 'plaintext', uselang: 'zh-cn',
				..._deleteKeys(params),
			};
			request.post({url: this.url, form}, _callback(resolve, reject));
		});
	}
}

module.exports = Rp;
