/**
 * @Function: 分析RecentChanges数据，并生成消息发送至QQ
 */
'use strict';
const {error, trim, decodeHtml} = require('./dev.js'),
	{promises: fs} = require('fs'),

	// 常用编辑工具
	tools = {Wikiplus: /\/\/ (?:使用Wikiplus小工具快速编辑|Edit via Wikiplus)/,
		Inspector: /\/\/使用页面\/文本对比查看器快速编辑/,
		HotDefaultSort: /使用HotDefaultSort小工具/,
		HotCat: /(?:使用HotCat小工具|——HotCat)/,
		Mainpage: /使用Mainpage小工具快速编辑/,
		Definitions: /使用definitions小工具编辑/,
		CodeMirror: /使用CodeMirror快速编辑/,
		批量回退: /^批量回退：/,
		'Cat-a-lot': /使用Cat-a-lot小工具/,
		mobileBlock: /使用mobileBlock小工具创建/,
		InPageEdit: /\[InPageEdit]/,
	},
	// 日志类型
	actions = {upload: '上传', overwrite: '上传新版本', revert: '文件回退', delete: '删除', restore: '还原',
		create: '新用户', create2: '新用户', protect: '保护', unprotect: '移除保护', modify: '更改保护',
		rights: '更改权限', block: '封禁', unblock: '解封', reblock: '更改封禁', move: '移动', move_redir: '移动',
		revision: '隐藏', change: '内容模型更改',
	},
	// 标签类型
	tagsList = {'mw-rollback': '回退', 'mw-undo': '撤销', 'mw-blank': '清空', 'mw-replce': '替换',
		'mw-changed-redirect-target': '重定向目标更改', 'mw-removed-redirect': '移除重定向', bigdelete: '大段删除',
		'mw-contentmodelchange': '内容模型更改',
	},
	specialPage = /^(?:special|特殊):/i;

// 各种工具函数
const _comment = {
	replaceLinks: (comment) => comment.replace(/\[\[[\s\u200e]*:?(?:[^[\]{}]+?\|)?(.+?)\|?]]/g, '$1'),
	findSection(str) {
		let section = '';
		const comment = str.replace(/\/\*\s*(.+?)\s*\*\//, (_, hash) => {
			section = `${hash}`;
			return '';
		});
		return [comment, section];
	},
	findTool(comment) {
		comment = comment.replace(/没有编辑摘要/, ''); // eslint-disable-line no-param-reassign
		for (const [key, val] of Object.entries(tools)) {
			if (val.test(comment)) {
				return [comment.replace(val, ''), key];
			}
		}
		return [comment, ''];
	},
};

const _group = (groups = []) => groups.join('、') || '（无）';

const _convertTime = (time) => {
	const date = new Date(time),
		timeZone = 'asia/shanghai';
	// eslint-disable-next-line prefer-template
	return date.toLocaleDateString('zh', {timeZone, month: 'numeric', day: 'numeric'}).replace('/', '.')
		+ ` ${date.toLocaleTimeString('ia', {timeZone, hour: 'numeric', minute: '2-digit', hour12: false})}`;
};

// 准备QQ消息
const _msgTemplate = (title, summary, sizeDiff, user, timestamp, comment, link = '') => {
	const time = _convertTime(timestamp);
	comment = trim(comment); // eslint-disable-line no-param-reassign
	return `${title}\n${summary} | ${sizeDiff}${sizeDiff && ' | '}${user} | ${time}\n${comment}\n${link}`
		.replaceAll('\n\n', '\n').replace(/\n$/, '');
};

const _handleReplace = (rules, rc, summary) => {
	const {user, title, revid} = rc;
	let {comment} = rc;
	comment = decodeHtml(comment.slice(7));
	if (rules[comment]) {
		rules[comment].count++;
	} else {
		rules[comment] = {count: 1, summary, user, title, revid};
	}
};

const _notOnline = () => {
	error(`${new Date().toISOString()} QQ已断开连接！`);
};

// 解析内链
const _wikilink = (text) => {
	return [...text.matchAll(/\[\[[\s\u200e]*:?(.+?)(?:#.*)?(?:\|.*)?[\s\u200e]*]]/g)].map(([, page]) => page);
};

const _normalize = (fromTitle, {normalized = [], converted = [], pages = []}) => {
	let toTitle = fromTitle;
	toTitle = normalized.find(({from}) => from === toTitle)?.to || toTitle;
	toTitle = converted.find(({from}) => from === toTitle)?.to || toTitle;
	return pages.find(({title}) => title === toTitle)?.pageid;
};

class Rc {
	#api;
	#qq;
	#gid;
	#params;
	#categories;
	#getPrivacy;
	#path;
	#url;

	constructor(api, qq, gid, path, params, categories, getPrivacy = () => false, url = null) {
		this.#api = api;
		this.#qq = qq;
		this.#gid = gid;
		this.#params = params;
		this.#categories = categories;
		this.#getPrivacy = getPrivacy;
		this.#path = path;
		this.rcstart = require(path);
		this.#url = url;
	}

	#prepareLink(rc) {
		const {revid, logid} = rc,
			url = this.#api.url.slice(8).replace(/(?:\/mediawiki)?\/api\.php$/, ''),
			isLLWiki = url === 'llwiki.org';
		if (logid) {
			return `${url}/${isLLWiki ? 'zh/' : ''}special:log?logid=${logid}`;
		}
		if (revid) {
			return `${url}${isLLWiki ? '/zh' : '/_'}?diff=${revid}`;
		}
	}

	#handleLog(rc, summary) {
		const {logaction, logtype, logparams, user, timestamp, logid} = rc,
			link = this.#prepareLink(rc);
		let {title, comment} = rc,
			action = actions[logaction];
		if (logtype === 'protect') {
			comment = `${trim(logparams.description)}${comment}`;
		} else if (logaction === 'rights') {
			comment = `从${_group(logparams.oldgroups)}到${_group(logparams.newgroups)}。${comment}`;
		} else if (logtype === 'abusefilter') {
			action = '滥用过滤器';
		} else if (logtype === 'move') {
			title += ` → ${logparams.target_title}`;
		} else if (logtype === 'managetags') {
			title = `标签：${logparams.tag}`;
		} else if (!action) {
			throw `未识别的日志类型：${logtype}/${logaction} - ${logid}`;
		}
		return _msgTemplate(title, summary + action, '', user, timestamp, comment, link);
	}

	#handleEdit(rc, summary) {
		const {redirect, bot, user, timestamp, tags} = rc,
			tagName = Object.keys(tagsList).find(tag => tags.includes(tag)),
			link = this.#prepareLink(rc);
		let {title, comment} = rc,
			sizeDiff = rc.newlen - rc.oldlen,
			section = '',
			action = '';
		if (comment.startsWith('创建页面，内容为')) {
			rc.new = true;
			comment = '';
		} else {
			[comment, section] = _comment.findSection(comment);
			[comment, action] = _comment.findTool(comment);
			if (section) {
				title += ` § ${section}`;
			}
			if (bot) {
				action = 'bot';
			}
		}
		if (tagName) {
			action += tagsList[tagName];
		} else if (rc.new) {
			action += redirect ? '新重定向' : '新页面';
		} else if (user === '重定向修复器') {
			action += '重定向目标更改';
		} else {
			action ||= '编辑';
		}
		if (sizeDiff > 0) {
			sizeDiff = `+${sizeDiff}`;
		} else {
			sizeDiff = sizeDiff.toString();
		}
		return _msgTemplate(title, summary + action, sizeDiff, user, timestamp, comment, link);
	}

	#analyze(rc, replaceRules) {
		const {comment, user, logtype, logaction, revid, tags = []} = rc,
			summary = tags.includes('mobile edit') ? '手机版' : '';

		// 1. 不处理多余的移动、保护、内容模型更改和删除
		if (comment.startsWith(`${user}移动页面[[`) || comment.startsWith(`${user} 已移動頁面 [[`)
			|| ['protect', 'contentmodel'].includes(logtype) && revid === 0 || logaction === 'delete_redir') {
			return;
		}

		// 2. 保存文本替换相关信息
		if (comment.startsWith('文本替换 - 替换“')) {
			_handleReplace(replaceRules[this.#getPrivacy(rc)], rc, summary);
			return;
		}

		// 3. 修正被标记为编辑的保护和内容模型更改
		if (/^已保护“\[\[.+?]]”（\[编辑=/.test(comment)) {
			rc.type = 'log';
			rc.logtype = 'protect';
			rc.logaction = 'protect';
		} else if (/^已从“\[\[.+?]]”移除保护/.test(comment)) {
			rc.type = 'log';
			rc.logtype = 'protect';
			rc.logaction = 'unprotect';
		} else if (/^已更改“\[\[.+?]]”的保护等级/.test(comment)) {
			rc.type = 'log';
			rc.logtype = 'protect';
			rc.logaction = 'modify';
		} else if (tags.includes('mw-contentmodelchange')) {
			rc.type = 'log';
			rc.logtype = 'contentmodel';
			rc.logaction = 'change';
		}

		// 4. 解析摘要中的内链
		rc.comment = _comment.replaceLinks(comment);

		if (rc.logtype) {
			return this.#handleLog(rc, summary);
		}
		return this.#handleEdit(rc, summary);
	}

	// 合并文本替换消息
	#replaceMsg([key, {count, summary, user, title, revid}]) {
		if (count > 1) {
			return `${count} 个页面\n${summary}文本替换 | ${user}\n${key}`;
		}
		const link = this.#prepareLink({revid});
		return `${title}\n${summary}文本替换 | ${user}\n${key}\n${link}`;
	}

	// 获取符合要求的最近更改
	async #get(rcstart, rcend) {
		await this.#api.login();
		if (this.#categories) {
			return this.#api.recentChangesInCategories(this.#categories, rcstart, rcend, this.#params);
		}
		return this.#api.recentChanges(rcstart, rcend);
	}

	// 在线或离线记录最近更改
	async #post(rcstart, rcend, offline) {
		const replaceRules = [{}, {}],
			[rcl, timestamp] = await this.#get(rcstart, rcend);
		rcl.forEach((rc, t) => {
			try {
				const msg = this.#analyze(rc, replaceRules);
				if (msg !== undefined) {
					this.#qq.sendMsg(msg, t, this.#gid, this.#getPrivacy(rc), offline);
				}
			} catch (e) {
				this.#qq.sendErrorMsg(e, offline);
			}
		});
		replaceRules.forEach((rules, i) => {
			Object.entries(rules).forEach((entry, t) => {
				this.#qq.sendMsg(this.#replaceMsg(entry), t, this.#gid, i, offline);
			});
		});
		return timestamp;
	}

	async #postWithError(n) {
		try {
			this.rcstart = await this.#post(this.rcstart);
			fs.writeFile(this.#path, JSON.stringify(this.rcstart));
		} catch (e) {
			if (e === '504') {
				this.#qq.sendErrorMsg(`${this.#api.site}触发错误代码 504 ！`);
			} else if (e === '502') {
				this.#qq.sendErrorMsg(`第 ${n} 次：${this.#api.site}触发错误代码 502 ！`);
				if (n < 3) { // 502时最多重复3次
					await this.#postWithError(n + 1);
				}
			} else if (e === 'waf') {
				this.#qq.sendErrorMsg(`${this.#api.site}触发 WAF ！`);
			} else if (e?.code) {
				this.#qq.sendErrorMsg(`${this.#api.site}触发错误 ${e.code} ！`);
			} else {
				this.#qq.sendErrorMsg('未知错误！请查阅控制台记录。');
				error(e);
			}
		}
	}

	async #recursivePost() {
		if (this.#qq.isOnline()) {
			await this.#postWithError(1);
		} else {
			_notOnline();
		}
		setTimeout(() => {
			this.#recursivePost();
		}, 1000 * 60 * 10);
	}

	#inform() {
		if (this.#qq.isOnline()) {
			this.#qq.sendPrivateMsg(`${this.#api.site}最近一次检查至：${this.rcstart}`);
		} else {
			_notOnline();
		}
		setTimeout(() => {
			this.#inform();
		}, 1000 * 60 * 60);
	}

	async watch() {
		await this.#recursivePost();
		this.#inform();
	}

	// 检查某一天并离线记录
	test(rcstart) {
		try {
			const date = new Date(rcstart);
			date.setDate(date.getDate() + 1);
			this.#post(rcstart, date.toISOString(), true);
		} catch {
			error('无效的时间戳！');
		}
	}

	watchGroupMsg() {
		if (typeof this.#url !== 'string') {
			throw new TypeError('站点网址应为字符串！');
		}
		this.#qq.watchGroupMsg(this.#gid, async (msg) => {
			const links = [...new Set(msg.flatMap(_wikilink))],
				titles = links.filter(title => !specialPage.test(title)).join('|'),
				printed = {},
				{query} = titles ? await this.#api.get({titles, converttitles: 1}) : {};
			links.forEach((title, t) => {
				if (specialPage.test(title)) {
					title = title.replace(specialPage, 'special:'); // eslint-disable-line no-param-reassign
					this.#qq.sendMsg(`${this.#url}/${encodeURIComponent(title)}`, t, this.#gid);
					return;
				}
				const pageid = _normalize(title, query);
				if (pageid === undefined) {
					this.#qq.sendMsg(`${this.#url}/special:search/${encodeURIComponent(title)}`, t, this.#gid);
				} else if (!printed[pageid]) {
					printed[pageid] = true;
					this.#qq.sendMsg(`${this.#url}?curid=${pageid}`, t, this.#gid);
				}
			});
		});
	}

	setUrl(url) {
		this.#url = url;
	}
}

module.exports = Rc;
