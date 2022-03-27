const fs = require('fs'),
	{yahoo, diff} = require('../lib/dev.js');

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
	const output = (await yahoo(replaced, {middle: '|'}))
		.replace(/\$(\d+)/g, (_, k) => { // 替换回原文中的模板
			return templates[k - 1][0];
		});

	// 3. 输出
	fs.writeFileSync('ruby', output);
	if (process.argv.length > 2) {
		console.log(await diff('lyrics', 'ruby'));
	}
})();
