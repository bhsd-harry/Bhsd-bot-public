'use strict';
const fs = require('fs'),
	dev = require('../lib/dev.js');

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
	await Promise.all(['kakasi', 'yahoo'].map(async method => {
		const output = (await dev[method](replaced, {middle: '|'}))
			.replace(/\$(\d+)/g, (_, k) => { // 替换回原文中的模板
				return templates[k - 1][0];
			});
		fs.writeFileSync(`ruby-${method}`, output);
	}));
	console.log(await dev.diff('ruby-kakasi', 'ruby-yahoo'));
})();
