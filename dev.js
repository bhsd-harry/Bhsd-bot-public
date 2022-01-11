/**
 * @Function: 仅用于提供一些基础公用函数
 */
'use strict';
const {spawn} = require('child_process');

// 命令行输出函数
const error = (msg = 'dev.error测试') => {
	console.log('\x1b[31m%s\x1b[0m', msg);
};
const info = (msg = 'dev.info测试') => {
	console.log('\x1b[32m%s\x1b[0m', msg);
};

// 判断是否为对象
const isObject = (obj) => typeof obj?.toString === 'function' && obj.toString() === '[object Object]';

// 将Shell命令转化为Proimse
const cmd = (str) => new Promise(resolve => {
	const [command, ...args] = str.split(/\s+/);
	spawn(command, args).stdout.on('data', data => {
		resolve(data.toString());
	});
});

const ping = async (url) => {
	const response = await cmd(`curl -LsI -o /dev/null -w "%{http_code}%{url_effective}" --connect-timeout 3 ${url}`);
	const code = Number(response.slice(1, 4)),
		redirect = response.slice(4, -1);
	if (code === 0 || code >= 400) {
		throw url;
	} else if (url !== redirect) {
		throw [url, redirect];
	}
	return url;
};

// 延时
const sleep = (t) => new Promise(resolve => {
	setTimeout(resolve, t * 1000);
});

// 移除不可见空格
const trim = (str = '') => str.replaceAll('\u200e', '').trim();

module.exports = {error, info, isObject, cmd, ping, sleep, trim};