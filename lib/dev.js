/**
 * @Function: 仅用于提供一些基础公用函数
 */
'use strict';
const {spawn, exec} = require('child_process'),
	fs = require('fs'),
	{promises} = fs;

process.on('unhandledRejection', e => {
	console.error(e);
});

const urlRegex = '[^\\s[\\]<>"|{}()]';

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
const error = (msg = 'dev.error测试', ...args) => {
	console.log('\x1b[31m%s\x1b[0m', msg, ...args);
};
/**
 * 命令行输出信息
 * @param {string} msg
 */
const info = (msg = 'dev.info测试', ...args) => {
	console.log('\x1b[32m%s\x1b[0m', msg, ...args);
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
	return promises.writeFile(file, JSON.stringify(obj, null, '\t'));
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
const _cmd = (command, args, encoding) => new Promise(r => {
	let timer;
	const resolve = val => {
		clearTimeout(timer);
		r(val);
	};
	try {
		const shell = spawn(command, args);
		let buf = '';
		timer = setTimeout(() => {
			shell.kill('SIGINT');
		}, 60 * 1000);
		shell.stdout.on('data', data => {
			buf += data.toString(encoding);
		});
		shell.stdout.on('end', () => {
			resolve(buf);
		});
		shell.on('exit', () => {
			resolve(shell.killed ? null : '');
		});
		shell.on('error', () => {
			resolve(null);
		});
	} catch {
		resolve(null);
	}
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
 * @param {boolean} stdin - 是否使用stdin而非文件输入
 * @returns {Promise<string>}
 */
const diff = async (oldfile, newfile, stdin) => {
	if (stdin) {
		await Promise.all([promises.writeFile('oldcontent', oldfile), promises.writeFile('newcontent', newfile)]);
	}
	const stdout = await _cmd('git', [
		'diff',
		'--color-words=[\xc0-\xff][\x80-\xbf]+|<?/?\\w+/?>?|[^[:space:]]',
		'-U0',
		'--no-index',
		stdin ? 'oldcontent' : oldfile,
		stdin ? 'newcontent' : newfile,
	]);
	// ], 'hex');
	if (stdin) {
		promises.unlink('oldcontent');
		promises.unlink('newcontent');
	}
	return stdout.split('\n').slice(4).join('\n');
	// const start = Buffer.from('\x1b[7;31m').toString('hex'),
	// 	middle = Buffer.from('\x1b[m').toString('hex'),
	// 	end = Buffer.from('\x1b[7;32m').toString('hex'),
	// 	pattern = new RegExp(`([c-f].(?:[8-9a-b].)?)${start}(.+?)${middle}(${end})?`, 'g');
	// return stdout && Buffer.from(
	// 	stdout.split('0a').slice(4).join('0a').replace(pattern, (_, p1, p2, p3) => {
	// 		if (p3 === undefined && p2.endsWith(p1)) {
	// 			return `${start}${p1}${p2.slice(0, -p1.length)}${middle}${p1}`;
	// 		}
	// 		return `${start}${p1}${p2}${middle}${p3}${p1}`;
	// 	}),
	// 	'hex',
	// ).toString();
};
/**
 * 测试网址
 * @promise Ping
 * @fulfill {string} 网址
 * @reject {string} 网址
 * @reject {[string, string]} 原网址和重定向网址
 * @promise PingCode
 * @fulfill {[string, number]} 输入网址和http_code
 * @param {string} url
 * @param {boolean} onlyCode - 返回http_code而非重定向网址
 * @param {number} count - 尝试次数
 * @returns {Ping|PingCode}
 */
const ping = async (url, onlyCode, count = 0) => {
	const response = await _cmd('curl', [
		'-LsI',
		'-o',
		'/dev/null',
		'-w',
		"'%{http_code}%{url_effective}'",
		'--connect-timeout',
		'10',
		url,
	]);
	if (response === null) {
		error(`使用curl访问 ${url} 失败！`);
		throw url;
	}
	let code = Number(response.slice(1, 4)),
		redirect = response.slice(4, -1);
	if (code === 0 && count < 3) { // 尝试3次
		await sleep(10);
		return ping(url, onlyCode, count + 1);
	} else if (code < 400 && /\b404\.s?html?$/i.test(redirect)) {
		code = 404;
	}
	if (onlyCode) {
		return [url, code];
	}
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
/**
 * 获取Content-Length
 * @param {string} url
 * @returns {Promise<number>}
 */
const contentLength = async url => {
	if (/^https?:\/\/static\.mengniang\.org\//.test(url)) {
		throw url;
	} else if (/^https?:\/\/store-images\.s-microsoft\.com\//.test(url)) {
		const filename = url.split('/').at(-1);
		return new Promise((resolve, reject) => {
			exec(`curl -O ${url}`, () => {
				if (fs.existsSync(filename)) {
					const {size} = fs.statSync(filename);
					fs.unlinkSync(filename);
					resolve(size);
				}
				reject(url);
			});
		});
	}
	const response = await new Promise((resolve, reject) => {
		exec(`curl -LsI -A 'Mozilla' -w '%{http_code}%{content_type}' '${url}'`, (err, stdout) => {
			if (err) {
				reject(err);
			}
			resolve(stdout);
		});
	});
	const writeout = response.split('\n').at(-1),
		code = Number(writeout.slice(0, 3)),
		type = writeout.slice(3);
	if (code === 0 || code >= 400) {
		error(`使用curl访问 ${url} 失败：${code}！`);
		throw url;
	} else if (type && !type.startsWith('image/')) {
		error(`使用curl访问 ${url} 失败：${type}！`);
		throw url;
	}
	const length = Number(response.match(/(?<=content-length:\s*)\d+(?=\s)/ig)?.at(-1));
	if (Number.isNaN(length) || length <= 1) {
		throw url;
	} else if (type === '') {
		error(`${url} 没有返回Content-Type，请人工检查Content-Length是否为 ${
			length < 1024 ** 2 ? `${(length / 1024).toFixed(0)} KB` : `${(length / 1024 ** 2).toFixed(2)} MB`
		}！`);
	} else if (/^https?:\/\/i\.imgur\.com\//.test(url) && length === 503
		|| /^https?:\/\/s\d\.ax1x\.com\//.test(url) && length === 5889
	) {
		error(`使用curl访问 ${url} 失败：404！`);
		throw url;
	}
	return length;
};
/**
 * 获取网页存档信息
 * @promise Archive
 * @fulfill {[string, string, string, ?string]} 网址、存档日期、标题和页面语言
 * @param {string|Object.<'url'|'timestamp', string>} brokenUrl
 * @returns {?Archive}
 */
const wayback = async brokenUrl => {
	const wm = require('wayback-machine'),
		crypto = require('crypto');
	const noWayback = /^https?:\/\/(?:space|t)\.bilibili\.com\/\d+/;
	let url, timestamp;
	if (typeof brokenUrl === 'string' && noWayback.test(brokenUrl)) {
		return null;
	}
	try {
		({url, timestamp} = typeof brokenUrl === 'string'
			? await new Promise((resolve, reject) => {
				wm.getClosest(brokenUrl, (err, closest) => {
					if (err || !closest) {
						reject();
					}
					resolve(closest);
				});
			})
			: brokenUrl
		);
	} catch {
		return null;
	}
	const file = `raw-${crypto.createHash('md5').update(url).digest('hex')}`;
	if (!fs.existsSync(file)) {
		await _cmd('curl', ['-i', '-r', '0-1023', '-o', file, url]);
	}
	let head = '';
	try {
		head = fs.readFileSync(file, 'utf8');
		const encoding = head.match(/(?<=Content-Type:.+;\s*charset=)[\w-]+(?=\n)/)?.[0]
			?? head.match(/(?<=<meta\s[^>]*charset="?)[\w-]+/)?.[0]
			?? head.match(/(?<=<\?xml\s[^>]*encoding=").+?(?=")/)?.[0];
		if (encoding) {
			head = await _cmd('iconv', ['-f', encoding, '-t', 'utf-8', file]);
		}
	} catch {}
	const title = head.match(/(?<=<title.*?>\s*)[\s\S]+?(?=\s*<\/title>)/)?.[0]?.replaceAll('\n', ' ');
	let lang = head.match(/(?<=<(?:html|body|div)[^>]*\s(?:xml:)?lang=").*?(?=")/)?.[0]
		?.split('-', 1)?.[0]?.toLowerCase();
	if (lang === 'en') {
		if (/[\p{Script=Hira}\p{Script=Kana}]/u.test(title ?? '')) {
			lang = 'ja';
		} else if (/\p{Script=Han}/u.test(title ?? '')) {
			lang = 'zh';
		}
	}
	try {
		fs.unlinkSync(file);
	} catch {}
	return [
		`${url.replace(/^http:\/\//, 'https://')}`,
		`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`,
		title,
		lang,
	];
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
const _furigana = async (str, analyzer, {middle = '|', start = '{{photrans|', end = '}}'}) => {
	const {default: Kuroshiro} = require('kuroshiro'),
		kuroshiro = new Kuroshiro();
	await kuroshiro.init(analyzer);
	const corrections = require('../config/photrans'),
		result = await kuroshiro.convert(str, {mode: 'furigana'});
	return result.replace(/<ruby>(.+?)<rt>(.+?)<\/rt><\/ruby>/g, (_, rb, rt) =>
		`${start}${rb}${middle}${corrections[rb]?.[rt] ?? rt}${end}`,
	);
};
/**
 * 使用Kakasi或Kuromoji注音
 * @param {string} str
 * @param {?object} options
 * @returns {Promise<string>}
 */
const kakasi = (str, options = {}) => {
	const Kakasi = require('./kakasi-analyzer');
	return _furigana(str, new Kakasi(), options);
};
const kuromoji = (str, options = {}) => {
	const Kuromoji = require('kuroshiro-analyzer-kuromoji');
	return _furigana(str, new Kuromoji(), options);
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
	const Yahoo = require('kuroshiro-analyzer-yahoo-webapi'),
		ruby = (await _furigana(str, new Yahoo({
			appId: 'dj00aiZpPXE2azZNYXFyR29kSSZzPWNvbnN1bWVyc2VjcmV0Jng9ODY-',
		}), options)).replaceAll('&lt;', '<').replaceAll('&gt;', '>');
	promises.writeFile('cache/lyrics', str);
	promises.writeFile('cache/ruby-yahoo', ruby);
	return ruby;
};

module.exports = {
	urlRegex,
	isObject,
	sleep,
	error,
	info,
	save,
	runMode,
	cmd,
	ping,
	contentLength,
	wayback,
	diff,
	trim,
	decodeHtml,
	escapeRegExp,
	kakasi,
	kuromoji,
	yahoo,
};
