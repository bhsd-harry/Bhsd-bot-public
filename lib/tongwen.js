'use strict';

const t2sChar = require('tongwen-dict/dist/t2s-char.json'),
	s2tChar = require('tongwen-dict/dist/s2t-char.json');

/**
 * 繁体转简体
 * @param {string} str
 * @returns {string}
 */
const t2s = str => str.replace(/[\u3300-\uFE4F]/gu, c => t2sChar[c] || c);

/**
 * 简体转繁体
 * @param {string} str
 * @returns {string}
 */
const s2t = str => str.replace(/[\u3300-\uFE4F]/gu, c => s2tChar[c] || c);

module.exports = {
	t2s,
	s2t,
};
