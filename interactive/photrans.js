const fs = require('fs'),
	{kakasi, diff} = require('../lib/dev.js');

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
	fs.writeFileSync('lyrics', replaced);

	// 2. 准备循环变量
	let i = 0, // lyrics字符计数器
		j = 0, // photrans数组计数器
		output = '';

	// 3. 准备工具函数
	const corrections = {}; // 仅用于临时修复，之后应迁移至kakasidict
	const save = () => { // 退出前务必保存原始歌词和当前输出
			fs.writeFileSync('ruby', output);
			fs.writeFileSync('lyrics', lyrics);
		},
		test = (a, b) => { // 通常不太可能出错，仅以防万一
			if (a.startsWith('～')) {
				output += '～';
				i++;
				const plain = replaced.slice(i, i + b.length);
				test(plain, b);
			} else if (a !== b) {
				save();
				throw new Error(`原文 "${a}" 和被注音的文字 "${b}" 不匹配！`);
			}
			i += a.length;
		},
		format = (rb, rt) => `{{photrans|${rb}|${corrections[rb] ?? rt}}}`;

	// 4. 获取注音
	const photrans = (await kakasi('lyrics')).split(/[ \n]/),
		kanji = /[\u4e00-\u9fa5]+/g,
		kana = /[\u3041-\u3096\u3099-\u309f\u30a0-\u30ff]/; // eslint-disable-line no-misleading-character-class
	while (i < replaced.length) {
		const ch = replaced[i];
		if (ch === ' ' || ch === '\n') {
			i++;
			output += ch;
			continue;
		}
		const ruby = photrans[j];
		let plain;
		j++;
		if (!ruby.endsWith('}')) { // 无注音
			plain = replaced.slice(i, i + ruby.length);
			test(plain, ruby);
			output += ruby;
			continue;
		}
		const [rb, rt] = ruby.slice(0, -1).split('{'); // 有注音
		let text;
		plain = replaced.slice(i, i + rb.length);
		test(plain, rb);
		if (!kana.test(rb)) { // 全是汉字
			output += format(rb, rt);
			continue;
		}
		// 倒序逐个替换汉字
		const regex = new RegExp(`^${rb.replace(kanji, '(.+?)')}$`),
			rbMatch = [...rb.matchAll(kanji)].reverse(),
			rtMatch = rt.match(regex) || [],
			n = rbMatch.length;
		if (rtMatch.length !== n + 1) { // 借用test()抛出错误
			test(rb, rt);
		}
		text = rb;
		rbMatch.forEach(({0: word, index}, k) => {
			text = `${text.slice(0, index)}${format(word, rtMatch[n - k])}${text.slice(index + word.length)}`;
		});
		output += text;
	}

	// 5. 清理输出
	output = output.replace(/\$(\d+)/g, (_, k) => { // 替换回原文中的模板
		return templates[k - 1][0];
	});
	save();
	if (process.argv.length > 2) {
		console.log(await diff('lyrics', 'ruby'));
	}
})();
