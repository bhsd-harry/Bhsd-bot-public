/**
 * @Function: 仅用于生成萌娘共享需要的Api对象和QQ方法
 */
'use strict';
const Api = require('./api.js'),
	QQ = require('./qq.js'),
	Rc = require('./rc.js'),
	{promises: fs} = require('fs'),
	{error} = require('./dev.js'),
	categories = require('./categories.json'),
	{user, pin, account, uid, gid} = require('./user.json');

const api = new Api(user, pin, 'https://commons.moegirl.org.cn', '萌娘共享'),
	qq = global.qq || new QQ(account, uid),
	rc = new Rc(api, qq, gid, {rcnamespace: '6|14', grcnamespace: '6|14'}, categories);

let rcstart = require('./cmoegirl.json'),
	watchTimer, informTimer;

const _notOnline = () => {
	error('QQ已断开连接！');
	clearTimeout(watchTimer);
	clearTimeout(informTimer);
};

const _post = async (time) => { // 输入参数仅用来规避require-atomic-updates
	if (!qq.isOnline()) {
		_notOnline();
		return;
	}
	rcstart = await rc.post(time);
	fs.writeFile('cmoegirl.json', JSON.stringify(rcstart));
	watchTimer = setTimeout(() => {
		_post(rcstart);
	}, 1000 * 60 * 10);
};

const _inform = () => {
	if (qq.isOnline()) {
		qq.sendPrivateMsg(`萌娘共享最近一次检查至：${rcstart}`);
		informTimer = setTimeout(_inform, 1000 * 60 * 60);
	} else {
		_notOnline();
	}
};

const watch = async () => {
	await _post(rcstart);
	_inform();
};

const test = (time) => rc.test(time);

module.exports = {qq, watch, test};