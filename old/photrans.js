'use strict';
const fs = require('fs'),
	dev = require('../lib/dev');

const _ucfirst = str => str[0].toUpperCase() + str.slice(1);

(async () => {
	// 1. 将模板替换为占位符
	const lyrics = fs.readFileSync('lyrics', 'utf8');
	let templates = [
		...lyrics.matchAll(/<ref([\s\xa0].+?)?>.+?<\/ref>/g),
		...lyrics.matchAll(/{{.+?}}/g),
	].sort(({index: i}, {index: j}) => j - i); // 注意倒序替换
	templates = templates.filter(({0: word, index: i}) => {
		return !templates.some(({0: wrap, index: j}) => j < i && j + wrap.length > i + word.length);
	});
	let replaced = lyrics;
	templates.forEach(({0: word, index}, k) => {
		replaced = `${replaced.slice(0, index)}$${k + 1}${replaced.slice(index + word.length)}`;
	});

	// 2. 获取注音
	const promises = await Promise.allSettled(['kakasi', 'kuromoji', 'yahoo'].map(async method => {
		try {
			const photrans = (await dev[method](replaced, {middle: '|'}))
				.replace(/\$(\d+)/g, (_, k) => templates[k - 1][0]); // 替换回原文中的模板
			fs.writeFileSync(`ruby-${method}`, photrans);
			return method;
		} catch (e) {
			e.summary = `注音工具 ${_ucfirst(method)} 出错！`;
			throw e;
		}
	}));
	const success = promises.filter(({status}) => status === 'fulfilled'),
		reference = success.at(-1)?.value;
	for (const {value} of success.slice(0, -1)) {
		console.log(`比较 ${_ucfirst(value)} 和 ${_ucfirst(reference)} ：`);
		// eslint-disable-next-line no-await-in-loop
		console.log(await dev.diff(`ruby-${value}`, `ruby-${reference}`) || '无差异\n');
	}
	for (const {reason} of promises.filter(({status}) => status === 'rejected')) {
		console.error(reason);
	}
})();
