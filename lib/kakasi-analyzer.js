const fs = require('fs'),
	{exec} = require('child_process');

const _kakasi = file => new Promise(resolve => {
	exec(`kakasi -i utf8 -f -s -JH < ${file.replaceAll(' ', '\\ ')}`, (_, stdout) => {
		resolve(stdout);
	});
});

class Analyzer {
	str; // 原文
	result; // 输出
	i; // 原文字符计数器

	constructor() {
		this._analyzer = null;
	}

	async init() { // eslint-disable-line require-await
		if (this._analyzer === null) {
			this._analyzer = 'kakasi';
			this.result = [];
			return;
		}
		throw new Error('This analyzer has already been initialized.');
	}

	test(a, b) { // 通常不太可能出错，仅以防万一
		if (a.startsWith('～')) {
			this.result.push({surface_form: '～'});
			this.i++;
			const plain = this.str.slice(this.i, this.i + b.length);
			this.test(plain, b);
		} else if (a !== b) {
			throw new Error(`第 ${
				this.str.slice(0, this.i).split('\n').length
			} 行的原文 "${a}" 和被注音的文字 "${b}" 不匹配！`);
		}
		this.i += a.length;
	}

	async parse(str = '') { // eslint-disable-line class-methods-use-this
		this.str = str;
		this.result = [];
		this.i = 0;
		fs.writeFileSync('temp', str);
		const photrans = (await _kakasi('temp')).split(/[ \n]/).filter(s => s);
		fs.unlinkSync('temp');
		let j = 0; // photrans数组计数器
		while (this.i < str.length) {
			const ch = str[this.i];
			if ([' ', '\n'].includes(ch)) {
				this.i++;
				this.result.push({surface_form: ch});
				continue;
			}
			const ruby = photrans[j];
			let plain;
			j++;
			if (!ruby.endsWith('}')) { // 无注音
				plain = str.slice(this.i, this.i + ruby.length);
				this.test(plain, ruby);
				this.result.push({surface_form: ruby, reading: ruby});
				continue;
			}
			const [rb, rt] = ruby.slice(0, -1).split('{'); // 有注音
			plain = str.slice(this.i, this.i + rb.length);
			this.test(plain, rb);
			this.result.push({surface_form: rb, reading: rt});
		}
		return this.result.concat([]);
	}
}

module.exports = Analyzer;
