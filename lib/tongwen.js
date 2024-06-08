'use strict';

const t2sChar = require('tongwen-dict/dist/t2s-char.json');

/**
 * 繁体转简体
 * @param {string} str
 * @returns {string}
 */
const t2s = str => str.replace(/[\u3300-\ufe4f]/gu, c => t2sChar[c] || c);

module.exports = {
	t2s,
};
