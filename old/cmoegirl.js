/**
 * @Function: 仅用于生成萌娘共享需要的Rc对象
 */
'use strict';
const Api = require('../lib/api'),
	QQ = require('../lib/qq'),
	Rc = require('../lib/rc'),
	categories = require('../config/categories'),
	{user, cmpin, account, uid, gid, password} = require('../config/user');

const api = new Api(user, cmpin, 'https://commons.moegirl.org.cn', '萌娘共享'),
	qq = global.qq || new QQ(account, uid, password),
	params = {rcnamespace: '6|14', grcnamespace: '6|14'},
	rc = new Rc(api, qq, gid, '../config/cmoegirl.json', 'commons.moegirl.org.cn', __filename, params, categories);

module.exports = {qq, rc};
