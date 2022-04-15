/**
 * @Function: 仅用于提供一些基础公用函数
 */
'use strict';
const {spawn} = require('child_process'),
	fs = require('fs');

// 通用函数
/**
 * 判断是否为对象
 * @param {any} obj
 * @returns {boolean}
 */
const isObject = obj => typeof obj?.toString === 'function' && obj.toString() === '[object Object]';
/**
 * 延时
 * @param {number} t - 秒数
 * @returns {promise}
 */
const sleep = t => new Promise(resolve => {
	setTimeout(resolve, t * 1000);
});

// 输入输出函数
/**
 * 命令行输出错误信息
 * @param {string} msg
 */
const error = (msg = 'dev.error测试') => {
	console.log('\x1b[31m%s\x1b[0m', msg);
};
/**
 * 命令行输出信息
 * @param {string} msg
 */
const info = (msg = 'dev.info测试') => {
	console.log('\x1b[32m%s\x1b[0m', msg);
};
/**
 * 以JSON格式保存到文件
 * @param {string} file - JSON文件路径
 * @param {any} obj - 可转化为JSON格式的数据
 * @returns {promise}
 */
const save = (file, obj) => {
	if (!file.endsWith('.json')) {
		throw new RangeError('dev.save函数只用于以JSON格式保存！');
	}
	return fs.promises.writeFile(file, JSON.stringify(obj, null, '\t'));
};
/**
 * 选择运行模式
 * @param {?(string|string[])} modes - 额外支持的运行模式名
 * @returns {?string}
 */
const runMode = (modes = []) => {
	const [,, mode] = process.argv;
	if (mode && !['dry', 'rerun', ...typeof modes === 'string' ? [modes] : modes].includes(mode)) {
		throw new RangeError('未定义的运行参数！');
	}
	return mode;
};

// Shell函数
const _cmd = (command, args) => new Promise(resolve => {
	const shell = spawn(command, args);
	shell.stdout.on('data', data => {
		resolve(data.toString());
	});
	shell.on('exit', () => {
		resolve('');
	});
});
/**
 * 将Shell命令转化为Proimse
 * @param {string} str - 完整Shell命令
 * @returns {Promise<string>}
 */
const cmd = str => {
	const [command, ...args] = str.split(/\s+/);
	return _cmd(command, args);
};
/**
 * 比较两个文件
 * @param {string} oldfile
 * @param {string} newfile
 * @returns {Promise<string>}
 */
const diff = async (oldfile, newfile) => {
	const stdout = await _cmd('git', [
		'diff',
		'--color-words=<?/?\\w+/?>?|[^[:space:]]',
		'-U0',
		'--no-index',
		oldfile,
		newfile,
	]);
	return stdout && stdout.split('\n').slice(4).join('\n');
};
/**
 * 测试网址
 * @promise Ping
 * @fulfill {string} 网址
 * @reject {string} 网址
 * @reject {[string, string]} 原网址和重定向网址
 * @param {string} url
 * @returns {Ping}
 */
const ping = async url => {
	const response = await _cmd('curl', [
		'-LsI',
		'-o',
		'/dev/null',
		'-w',
		'"%{http_code}%{url_effective}"',
		'--connect-timeout',
		'5',
		url,
	]);
	const code = Number(response.slice(1, 4));
	let redirect = response.slice(4, -1);
	if (!url.slice(8).includes('/')) { // 只是domain而不是完整网址
		redirect = redirect.replace(/^(https?:\/\/[^/]+).*/, '$1'); // 匹配不到也没关系
	}
	if (code === 0 || code >= 400) {
		throw url;
	} else if (url !== redirect) {
		throw [url, redirect];
	}
	return url;
};

// 字符串处理
/**
 * 移除两端的可见和不可见空格
 * @param {?string} str
 * @returns {string}
 */
const trim = (str = '') => str.replace(/^[\s\u200e]+/, '').replace(/[\s\u200e]+$/, '');
/**
 * 解码HTML实体
 * @param {string} str
 * @returns {string}
 */
const decodeHtml = str => str.replace(/&(amp|lt|gt|#0?39|quot);/g, (_, code) => ({
	amp: '&', lt: '<', gt: '>', '#039': "'", '#39': "'", quot: '"',
}[code]));
/**
 * 为RegExp构造器预转义
 * @param {string} str
 * @returns {string}
 */
const escapeRegExp = str => str.replace(/[\\{}()|.?*+\-^$[\]]/g, '\\$&');

// 日文注音
const _furigana = async (str, analyzer, {middle, start = '{{photrans|', end = '}}'}) => {
	const {default: Kuroshiro} = require('kuroshiro'),
		kuroshiro = new Kuroshiro();
	await kuroshiro.init(analyzer);
	const corrections = require('../config/corrections.json'),
		result = await kuroshiro.convert(str, {mode: 'furigana'});
	return result.replace(/<ruby>(.+?)<rt>(.+?)<\/rt><\/ruby>/g, (_, rb, rt) =>
		`${start}${rb}${middle}${corrections[rb]?.[rt] ?? rt}${end}`,
	);
};
/**
 * 使用Kakasi注音
 * @param {string} str
 * @param {?object} options
 * @returns {Promise<string>}
 */
const kakasi = (str, options = {}) => {
	const KakasiAnalyzer = require('./kakasi-analyzer.js');
	return _furigana(str, new KakasiAnalyzer(), options);
};
/**
 * 使用Yahoo API注音
 * @param {string} str
 * @param {?object} options
 * @returns {Promise<string>}
 */
const yahoo = async (str, options = {}) => {
	const cache = fs.readFileSync('cache/lyrics', 'utf8');
	if (cache === str) {
		info('未访问Yahoo API，直接获取上一次缓存的结果。');
		return fs.readFileSync('cache/ruby-yahoo', 'utf8');
	}
	const YahooWebAnalyzer = require('kuroshiro-analyzer-yahoo-webapi'),
		ruby = (await _furigana(str, new YahooWebAnalyzer({
			appId: 'dj00aiZpPXE2azZNYXFyR29kSSZzPWNvbnN1bWVyc2VjcmV0Jng9ODY-',
		}), options)).replaceAll('&lt;', '<').replaceAll('&gt;', '>');
	fs.promises.writeFile('cache/lyrics', str);
	fs.promises.writeFile('cache/ruby-yahoo', ruby);
	return ruby;
};

/**
 * wikitext解析
 * @param {string} text
 * @returns {array}
 */
const parse = text => {
	/* global CeL */
	if (!global.CeL?.wiki?.parser) {
		require('../../CeJS/CeJS-master/_for include/node.loader.js');
		CeL.run('application.net.wiki.parser');
	}
	return CeL.wiki.parser(text).parse();
};

module.exports = {
	isObject,
	sleep,
	error,
	info,
	save,
	runMode,
	cmd,
	ping,
	diff,
	trim,
	decodeHtml,
	escapeRegExp,
	kakasi,
	yahoo,
	parse,
};
