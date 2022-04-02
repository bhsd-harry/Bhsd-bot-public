/**
 * @Function: 仅用于提供一些基础公用函数
 */
'use strict';
const {spawn} = require('child_process'),
	fs = require('fs');

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
	const shell = spawn(command, args);
	shell.stdout.on('data', data => {
		resolve(data.toString());
	});
	shell.on('exit', () => {
		resolve('');
	});
});

const ping = (url) => new Promise((resolve, reject) => {
	spawn('curl', ['-LsI', '-o', '/dev/null', '-w', '"%{http_code}%{url_effective}"', '--connect-timeout', '5', url])
		.stdout.on('data', data => {
			const response = data.toString(),
				code = Number(response.slice(1, 4));
			let redirect = response.slice(4, -1);
			if (!url.slice(8).includes('/')) { // 只是domain而不是完整网址
				redirect = redirect.replace(/^(https?:\/\/[^/]+).*/, '$1');
			}
			if (code === 0 || code >= 400) {
				reject(url);
			} else if (url !== redirect) {
				reject([url, redirect]);
			}
			resolve(url);
		});
});

const diff = (oldfile, newfile) => new Promise(resolve => {
	spawn('git', ['diff', '--color-words=<?/?\\w+/?>?|[^[:space:]]', '-U0', '--no-index', oldfile, newfile])
		.stdout.on('data', data => {
			resolve(data.toString().split('\n').slice(4).join('\n'));
		});
});

// 延时
const sleep = (t) => new Promise(resolve => {
	setTimeout(resolve, t * 1000);
});

// 移除不可见空格
const trim = (str = '') => str.replaceAll('\u200e', '').trim();

const save = (file, obj) => {
	fs.promises.writeFile(file, JSON.stringify(obj, null, '\t'));
};

const runMode = (modes = []) => {
	const [,, mode] = process.argv;
	if (mode && !['dry', 'rerun', ...typeof modes === 'string' ? [modes] : modes].includes(mode)) {
		throw new RangeError('未定义的运行参数！');
	}
	return mode;
};

const decodeHtml = (str) => str.replace(/&(amp|lt|gt|#0?39|quot);/g, (_, code) => ({
	amp: '&', lt: '<', gt: '>', '#039': "'", '#39': "'", quot: '"',
}[code]));

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

const kakasi = (str, options = {}) => {
	const KakasiAnalyzer = require('./kakasi-analyzer.js');
	return _furigana(str, new KakasiAnalyzer(), options);
};

const yahoo = async (str, options = {}) => {
	const cache = fs.readFileSync('cache/lyrics', 'utf8');
	if (cache === str) {
		info('未访问Yahoo API，直接获取上一次缓存的结果。');
		return fs.readFileSync('cache/ruby-yahoo', 'utf8');
	}
	const YahooWebAnalyzer = require('kuroshiro-analyzer-yahoo-webapi'),
		ruby = await _furigana(str, new YahooWebAnalyzer({
			appId: 'dj00aiZpPXE2azZNYXFyR29kSSZzPWNvbnN1bWVyc2VjcmV0Jng9ODY-',
		}), options);
	fs.promises.writeFile('cache/lyrics', str);
	fs.promises.writeFile('cache/ruby-yahoo', ruby);
	return ruby;
};

module.exports = {error, info, isObject, cmd, ping, sleep, trim, save, diff, runMode, decodeHtml, kakasi, yahoo};
