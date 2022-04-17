/**
 * @Function: 仅用于临时代替葫芦bot，生成萌娘百科需要的Rc对象
 */
'use strict';
const Api = require('../lib/api'),
	QQ = require('../lib/qq'),
	Rc = require('../lib/rc'),
	categories = require('../config/mcategories'),
	{user, pin, url, account, uid, gid, password} = require('../config/user');

const api = new Api(user, pin, url, '萌娘百科'),
	qq = global.qq || new QQ(account, uid, password),
	params = {rcnamespace: '0|10|14', grcnamespace: '0|10|14'},
	rc = new Rc(api, qq, gid, '../config/hulubot.json', 'zh.moegirl.org.cn', __filename, params, categories);

module.exports = {qq, rc};
