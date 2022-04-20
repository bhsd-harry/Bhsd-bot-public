const {urlRegex, escapeRegExp, parse, error} = require('./dev');

/** @type {RegExp} 其他PHP script（仅用于wgScriptPath和wgArticlePath一致的情形） */
const scripts = /^(?:api|load|thumb|img_auth|rest)\.php[/?]/,
	/** @type {string[]} 改写为对应内链时需要检查的index.php参数 */
	keys = ['action', 'title', 'oldid', 'diff', 'curid'],
	/** @type {RegExp} 语言变体路径，注意萌娘百科未开启my、sg和mo */
	langs = /^\/zh-(?:han[st]|cn|tw|hk)\//,
	/** @type {string[]} 不可改写为内链的常见action参数 */
	actions = ['history', 'info', 'watch', 'unwatch', 'rollback', 'render', 'submit', 'edit', 'raw'],
	/** @type {RegExp} 必须以':'开头的内链 */
	nsEscape = /^(?:file|[图圖]像|[档檔]案|文件|image|cat(?:egory)?|分[类類]):/i,
	nsUser = /^(?:user(?:[ _]talk)?|u|用[户戶](?:对话|對話|讨论|討論)?|使用者(?:討論)?):/i;
/**
 * 处理链接到本站的外链
 */
class WikiUrl {
	/**
	 * @param {string} wgServer
	 * @param {string} wgScript - 以'/'开头和结尾的wgScriptPath常数
	 * @example
	 * '/mediawiki/'; // LLWiki
	 * '/'; // 萌娘百科
	 * '/w/'; // 维基百科
	 * @param {string} wgArticlePath - 以'/'开头和结尾的wgArticlePath常数
	 * @example
	 * '/zh/'; // LLWiki
	 * '/'; // 萌娘百科
	 * '/wiki/'; // 维基百科
	 * @param {boolean} wgVariantArticlePath
	 */
	constructor(wgServer, wgScriptPath, wgArticlePath = wgScriptPath, wgVariantArticlePath = true) {
		if (!wgScriptPath.startsWith('/')) {
			throw new RangeError('常数 wgScriptPath 必须以"/"开头！');
		} else if (!wgScriptPath.endsWith('/')) {
			throw new RangeError('常数 wgScriptPath 必须以"/"结尾！');
		} else if (!wgArticlePath.startsWith('/')) {
			throw new RangeError('常数 wgArticlePath 必须以"/"开头！');
		} else if (!wgArticlePath.endsWith('/')) {
			throw new RangeError('常数 wgArticlePath 必须以"/"结尾！');
		}
		this.server = wgServer;
		this.script = wgScriptPath;
		this.article = wgArticlePath;
		this.variant = wgVariantArticlePath;
		/** @type {RegExp} 外链格式 */
		this.regex = new RegExp(
			`\\[{1,2}((?:https?:)?//${escapeRegExp(wgServer)}/${urlRegex}+)([\\s[<>"][^\\]]*)?\\s*\\]{1,2}`,
			'gi',
		);
	}

	/**
	 * 获取修正了title的URL参数
	 * @param {string} anchor - 外链
	 * @returns {?[Map.<string, string>, string]} URL参数和hash
	 */
	query(anchor, pageid = 0) {
		if (anchor.startsWith('//')) {
			anchor = `https:${anchor}`; // eslint-disable-line no-param-reassign
		}
		const url = new URL(anchor),
			{host, search, searchParams} = url;
		let {pathname, hash} = url;
		if (host !== this.server) { // 情形1: 外站
			return null;
		// 情形2: 不是index.php
		} else if (pathname.startsWith(this.script) && scripts.test(pathname.slice(this.script.length))) {
			error(`${pageid}: ${pathname} 不是index.php`);
			return null;
		} else if (this.variant && langs.test(pathname)) { // 情形3: 指定语言变种
			error(`${pageid}: ${pathname} 指定语言变种`);
			return null;
		} else if (this.variant && pathname.startsWith('/zh/')) {
			pathname = `${this.script}${pathname.slice(4)}`;
		}
		try {
			hash = hash
				&& decodeURIComponent(hash.replace(/\.(?=[A-F\d]{2})/g, '%'))
					.replace(/[|[\]{}&<]/g, c => encodeURI(c));
			if (hash.startsWith('#/media/File:')) { // 情形4: MultiMediaViewer
				searchParams.set('title', hash.slice(8));
				return [searchParams, ''];
			} else if (searchParams.get('title')) { // 情形5: 非空title参数
				return [searchParams, hash];
			}
			let title = '';
			if (pathname.startsWith(`${this.script}index.php`)) { // 情形6: /w/index.php/$1
				title = decodeURIComponent(pathname.slice(this.script.length + 10)); // 可能为''
			} else if (pathname === this.article.slice(0, -1)) { // 情形7: /wiki?
			// 情形8: /wiki/$1
			} else if (pathname.startsWith(this.article)) {
				title = decodeURIComponent(pathname.slice(this.article.length)); // 可能为''
			} else {
				error(`${pageid}: 未知情形 ${pathname}${search}`);
				return null;
			}
			if (title) {
				searchParams.set('title', title);
			}
			return [searchParams, hash];
		} catch (e) {
			if (e instanceof URIError) {
				e.message = `${pageid}: ${pathname}${hash}`;
				console.error(e);
				return null;
			}
			throw e;
		}
	}

	/**
	 * 获取可以改写为内链的title，可能改写为特殊页面
	 * @param {string} anchor - 外链
	 * @returns {?string} - 内链title
	 */
	getTitle(anchor, pageid = 0) {
		const query = this.query(anchor, pageid);
		if (!query) { // 情形1: 不是指向站内的外链
			return null;
		}
		const [searchParams, hash] = query,
			action = searchParams.get('action') ?? 'view';
		if (action !== 'view') { // 情形2: 不是view
			if (!actions.includes(action)) {
				error(`${pageid}: 未识别的action参数 ${action}`);
			}
			return null;
		} else if ([...searchParams.keys()].some(key => !keys.includes(key))) { // 情形3: 有未知的URL参数
			console.log(`${pageid}: 未识别的URL参数`, Object.fromEntries(searchParams));
			return null;
		}
		const oldid = searchParams.get('oldid'),
			diff = searchParams.get('diff'),
			curid = searchParams.get('curid'),
			title = searchParams.get('title') ?? '';
		if (diff) { // 情形4: 差异
			return oldid ? `Special:Diff/${oldid}/${diff}${hash}` : `Special:Diff/${diff}${hash}`;
		} else if (oldid) { // 情形5: 固定链接
			return `Special:PermaLink/${oldid}${hash}`;
		} else if (curid) { // 情形6: 重定向到页面
			return `Special:Redirect/page/${curid}${hash}`;
		}
		if (title === '') { // 情形7: 未知title
			searchParams.delete('title');
			console.log(`${pageid}: 首页或错误地址`, Object.fromEntries(searchParams));
			return null;
		} else if (nsUser.test(title)) {
			error(`${pageid}: 用户页链接 ${title}`);
			return null;
		}
		return `${title}${hash}`;
	}

	/**
	 * 将外链改写为内链
	 * @param {string} wikitext - WikiText外链语法
	 * @param {string} anchor
	 * @param {?string} text
	 * @returns {string} 外站外链或不能改写成内链的外链保持不变，否则改写为内链
	 */
	convert(wikitext, anchor, text = null, pageid = 0) {
		const title = this.getTitle(anchor, pageid);
		if (title === null) {
			return wikitext;
		}
		text = text && text.trim(); // eslint-disable-line no-param-reassign
		const escaped = nsEscape.test(title) ? `:${title}` : title;
		return text && text !== title ? `[[${escaped}|${text}]]` : `[[${escaped}]]`;
	}

	/**
	 * 将页面内的错误外链替换为内链
	 * @param {string} wikitext
	 * @returns {string}
	 */
	replace(wikitext, pageid) {
		const content = wikitext.replace(this.regex, (m, p1, p2) => this.convert(m, p1, p2, pageid)),
			parsed = parse(content);
		parsed.each('file', token => {
			const link = (token.link ?? '').toString();
			if (/^(?:https?:)\/\//i.test(link)) {
				const title = this.getTitle(link, pageid);
				if (title) {
					token[token.index_of.link][2] = title;
				}
			}
		});
		return parsed.toString();
	}
}

module.exports = WikiUrl;
