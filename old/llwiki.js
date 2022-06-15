/**
 * @Function: 仅用于生成LLWiki需要的Rc对象
 */
'use strict';
const Api = require('../lib/api'),
	QQ = require('../lib/qq'),
	Rc = require('../lib/rc'),
	{user, pin, url, account, uid, gid, password} = require('../config/user');

const api = new Api(user, pin, url, 'LLWiki'),
	qq = global.qq || new QQ(account, uid, password),
	publicNs = [0, 1, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 828, 829],
	privateTitle = ['Help:沙盒', 'Template:Sandbox'],
	rc = new Rc(
		api,
		qq,
		gid,
		'../../Bhsd-bot/config/rcstart.json',
		'llwiki.org/zh',
		__filename,
		undefined,
		undefined,
		recentchange => {
			const {ns, title, logtype, logparams, logaction} = recentchange;
			let isPublic = publicNs.includes(ns) && !privateTitle.includes(title)
			&& logtype !== 'protect' && logaction !== 'delete';
			if (logtype === 'newusers') {
				isPublic = true;
			} else if (!isPublic && logtype === 'move') {
				isPublic = publicNs.includes(logparams.target_ns);
			}
			return +!isPublic;
		},
	);

module.exports = {qq, rc};
