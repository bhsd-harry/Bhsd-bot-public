/**
 * @Function: 仅用于发送QQ消息
 */
'use strict';
const {createClient} = require('oicq'),
	{info, error} = require('./dev.js');

class QQ {
	#uid;

	constructor(account, uid) {
		if (typeof account !== 'number') {
			throw new TypeError('账号应为数字！');
		}
		if (typeof uid !== 'number') {
			throw new TypeError('管理人账号应为数字！');
		}
		this.client = createClient(account);
		this.#uid = uid;
	}

	isOnline() {
		return this.client.isOnline();
	}

	login() {
		if (!this.isOnline()) {
			this.client.login();
		}
	}

	logout() {
		if (this.isOnline()) {
			this.client.logout();
		}
	}

	sendMsg(msg, delay, gid, isPrivate, offline) {
		setTimeout(() => {
			if (offline) {
				info(isPrivate ? '私聊信息：' : '群发信息：');
				console.log(msg);
			} else if (!this.isOnline()) {
				throw '机器人未登入！';
			} else if (isPrivate) {
				this.client.sendPrivateMsg(this.#uid, msg);
			} else {
				if (!Number.isInteger(gid)) {
					throw new TypeError('gid应为整数！');
				}
				this.client.sendGroupMsg(gid, msg);
			}
		}, delay * 1000);
	}

	sendPrivateMsg(msg) {
		this.sendMsg(msg, 0, null, true);
	}

	sendErrorMsg(msg, offline) {
		if (!offline && this.isOnline()) {
			this.sendPrivateMsg(msg);
		} else {
			error(msg);
		}
	}
}

module.exports = QQ;