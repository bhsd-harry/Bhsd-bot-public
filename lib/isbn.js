'use strict';

const path = require('path');
const {execSync} = require('child_process');
const {error} = require('./dev');

const isbnDir = path.join(__dirname, '..', 'ISBN-normaliser-forMGP');
const map = new Map();

const getReturnValue = (value, mt, formatted) => formatted !== mt[0]
	&& (value.slice(0, mt.index) + formatted + value.slice(mt.index + mt[0].length))
		.replace(/ͼ([03])ͼ/gu, 'ISBN-1$1 ');

module.exports = /** @param {string | undefined} value */ value => {
	value = value?.replace(/ISBN-1([03]) /gu, 'ͼ$1ͼ');
	const mt = value && /(?:\d[\p{Zs}\t-]?){9,12}(?:\d|x\b)/iu.exec(value);
	if (!mt) {
		return false;
	}
	const digit = mt[0].replace(/[\p{Zs}\t-]/gu, '').toUpperCase(),
		cached = map.get(digit);
	if (typeof cached === 'string') {
		return getReturnValue(value, mt, cached);
	} else if (typeof cached === 'boolean') {
		return cached;
	}
	try {
		const formatted = execSync(
			`python ${isbnDir}/isbn_normalise.py --xml ${isbnDir}/RangeMessage.xml ${digit}`,
			{encoding: 'utf8'},
		).trim();
		map.set(digit, formatted);
		return getReturnValue(value, mt, formatted);
	} catch (e) {
		if (
			!/Error: (?:ISBN must be valid ISBN-10 or ISBN-13|ISBN-13 must start with 978 or 979).\n$/u
				.test(e.message)
		) {
			error(value);
			console.error(e);
			map.set(digit, true);
			return true;
		}
		map.set(digit, false);
		return false;
	}
};
