/**
 * @Function: 仅用于生成萌娘共享需要的Rc对象
 */
'use strict';
const Api = require('../Bhsd-bot-public/api.js'),
	QQ = require('../Bhsd-bot-public/qq.js'),
	Rc = require('../Bhsd-bot-public/rc.js'),
	categories = require('../Bhsd-bot-public/categories.json'),
	{user, pin, account, uid, gid} = require('../Bhsd-bot-public/user.json');

const api = new Api(user, pin, 'https://commons.moegirl.org.cn', '萌娘共享'),
	qq = global.qq || new QQ(account, uid),
	params = {rcnamespace: '6|14', grcnamespace: '6|14'},
	rc = new Rc(api, qq, gid, '../Bhsd-bot-public/cmoegirl.json', params, categories);

module.exports = {qq, rc};