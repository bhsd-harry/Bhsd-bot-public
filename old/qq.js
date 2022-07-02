/**
 * @Function: 仅用于发送QQ消息
 */
'use strict';
const {createClient} = require('oicq'),
	{info, error} = require('../lib/dev');

class QQ {
	#client;
	#uid;
	#password;

	constructor(account, uid, password) {
		if (!Number.isInteger(account)) {
			throw new TypeError('账号应为整数！');
		}
		if (!Number.isInteger(uid)) {
			throw new TypeError('管理人账号应为整数！');
		}
		this.#client = createClient(account, {reconn_interval: 0});
		this.#uid = uid;
		this.#password = password;
	}

	isOnline() {
		return this.#client.isOnline();
	}

	login() {
		if (!this.isOnline()) {
			this.#client.login(this.#password);
		}
	}

	loginQR() {
		if (!this.isOnline()) {
			delete this.#client.password_md5;
			this.#client.login();
		}
	}

	logout() {
		if (this.isOnline()) {
			this.#client.logout();
		}
	}

	sendMsg(msg, delay, gid, isPrivate, offline) {
		setTimeout(() => {
			if (offline) {
				info(isPrivate ? '私聊信息：' : '群发信息：');
				console.log(msg);
			} else if (!this.isOnline()) {
				throw '机器人未登入！';
			} else if (isPrivate || gid === null) {
				this.#client.sendPrivateMsg(this.#uid, msg);
			} else {
				if (!Number.isInteger(gid)) {
					throw new TypeError('gid应为整数！');
				}
				this.#client.sendGroupMsg(gid, msg).catch(({code}) => {
					if (code === 120) {
						this.#client.sendPrivateMsg(this.#uid, msg);
					}
				});
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

	watchGroupMsg(gid, callback) {
		this.#client.on('message.group', ({group_id, message}) => {
			if (group_id === gid) {
				callback(message.filter(({type}) => type === 'text').map(({text}) => text));
			}
		});
	}
}

module.exports = QQ;
