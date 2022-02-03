/**
 * @Function: 检查[[Category:调用重复模板参数的页面]]，如果可以则进行修复
 */
'use strict';
const {user, pin, url} = require('./user.json'),
	Api = require('./api.js'),
	{info, sleep, error, trim, runMode} = require('./dev.js');

const api = new Api(user, pin, url);

// 确定各模板及各参数的范围
const _scan = (str) => {
	let nt = 0, // 模板计数，0表示非模板
		nl = 0, // 局部内链计数，0表示非内链
		np; // 局部模板参数计数
	const len = str.length,
		tStack = [0], // 模板堆
		pStack = [], // 模板参数堆
		scope = new Array(len);
	for (let i = 0; i < len; i++) {
		const c = str[i];
		if (c === '{') {
			scope[i] = [tStack[0], np]; // 取外层scope
			tStack.unshift(++nt);
			pStack.unshift(np);
			np = 0;
		} else if (c === '}') {
			tStack.shift();
			np = pStack.shift();
			scope[i] = [tStack[0], np]; // 取外层scope
		} else if (c === '|' && nl === 0) {
			scope[i] = [tStack[0], ++np];
		} else {
			scope[i] = [tStack[0], np];
			if (c === '[' && str[i + 1] === '[') {
				nl = nl < 1 ? nl + 1 : 2; // 至多2层内链
				scope[i + 1] = [tStack[0], np];
				i++;
			} else if (c === ']' && str[i + 1] === ']') {
				nl = nl > 1 ? nl - 1 : 0;
				scope[i + 1] = [tStack[0], np];
				i++;
			}
		}
	}
	return scope;
};

const _findEnds = (scope, template, param) => {
	const start = scope.findIndex(([t, p]) => t === template && p === param),
		end = scope.length - scope.slice().reverse().findIndex(([t, p]) => t === template && p === param);
	return [start, end];
};

const _analyze = (wikitext, repeated, pageid, title) => {
	const regexPage = /(?<=页面【\[\[:).+?(?=]]】)/,
		regexTemplate = /(?<=模板【\[\[:).+?(?=]]】)/, // 仅用于判断是不是{{Timeline}}
		regexParam = /(?<=<code>\|)[\s\S]*?(?=<\/code>)/,
		failed = {}; // 避免重复失败的尝试
	let text = wikitext;
	repeated.forEach(warning => {
		const [page] = warning.match(regexPage);
		if (page !== title) {
			error(`请人工检查 ${page}`);
			return;
		}
		const [template] = warning.match(regexTemplate),
			[param] = warning.match(regexParam),
			lastTry = failed[param] || [];
		if (lastTry === true) { // true表示可以跳过
			return;
		}
		const regex = new RegExp(`\\|\\s*${param}\\s*=`, 'g'),
			regexStart = new RegExp(`^\\|\\s*${param}\\s*=`), // 只用于模板参数子串
			occurrence = [...text.matchAll(regex)]; // 只考虑命名参数写法
		if (occurrence.length <= 1) {
			error(`页面 ${pageid} 中重复的模板参数 ${param} 仅出现 ${occurrence.length} 次！`);
			failed[param] = true; // true表示可以跳过
			return;
		}
		const scope = _scan(text), // 宁可降低运行效率也要重新遍历一次，以保证更正确地处理下一组重复参数
			allScope = occurrence.map(({index}) => scope[index]).filter(([t]) => t > 0), // 位于模板内，不检测模板名
			tScope = allScope.map(([t]) => t),
			pScope = allScope.map(([, p]) => p),
			target = tScope.find((t, i) => !lastTry.includes(t) && tScope.indexOf(t) !== i);
		if (!target) {
			error(`页面 ${pageid} 中已找不到重复的模板参数 ${param} ！`);
			failed[param] = true; // true表示可以跳过
			return;
		}
		const curScope = pScope.filter((_, i) => tScope[i] === target),
			candidates = curScope.map(p => _findEnds(scope, target, p)),
			values = candidates.map(([start, end]) => trim(text.slice(start, end).replace(regexStart, ''))),
			redundant = values.findIndex((val, i) => val === '' || values.indexOf(val) !== i);
		if (redundant >= 0) { // 修复情形1：空参数或重复参数值
			const [start, end] = candidates[redundant];
			text = `${text.slice(0, start)}${text.slice(end)}`;
		} else if (template === 'Template:Timeline' && /in\d+月\d+日/.test(param)) { // 修复情形2：{{Timeline}}
			const [, [start, end]] = candidates,
				newText = text.slice(start, end).replace(param, `${param}#2`);
			text = `${text.slice(0, start)}${newText}${text.slice(end)}`;
		} else {
			error(`页面 ${pageid} 中重复的模板参数 ${param} 均非空，无法简单修复！`);
			failed[param] = [...lastTry, target];
		}
	});
	return text;
};

(async () => {
	const mode = runMode();
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode, '自动修复重复的模板参数');
		return;
	}
	const pageids = await api.onlyCategorymembers('调用重复模板参数的页面');
	const list = (await Promise.all(pageids.map(async ({pageid, title}, t) => {
		await sleep(t);
		const [wikitext, parsewarnings] = await api.parse({pageid});
		if (/{{[\s\u200e]*(?:[Ii]nuse|施工中|编辑中)/.test(wikitext)) {
			error(`已跳过施工中的页面 ${pageid} ！`);
			return null;
		}
		const repeated = parsewarnings.filter(warning => warning.includes("'''重复使用'''"));
		if (repeated.length === 0) {
			info(`页面 ${pageid} 已无重复的模板参数！`);
			return null;
		}
		const text = _analyze(wikitext, repeated, pageid, title);
		return text === wikitext ? null : [pageid, wikitext, text];
	}))).filter(page => page);
	await api.massEdit(list, mode, '自动修复重复的模板参数');
})();