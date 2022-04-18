const {urlRegex, escapeRegExp} = require('./dev');

const scripts = /^(?:api|load|thumb|img_auth|rest)\.php[/?]/,
	keys = ['action', 'title', 'oldid', 'diff', 'curid'],
	langs = /^\/zh(?:-(?:han[st]|cn|my|sg|tw|hk|mo))?\//,
	actions = ['history', 'info', 'watch', 'unwatch', 'rollback', 'render', 'submit', 'edit', 'raw'],
	ns = /^(?:file|[图圖]像|[档檔]案|文件|image|category|分[类類]|cat):/i;

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
		this.script = wgScriptPath;
		this.article = wgArticlePath;
		this.variant = wgVariantArticlePath;
		const pattern = `((?:https?:)?//${escapeRegExp(wgServer)}/${urlRegex}+)`;
		this.regex = new RegExp(`\\[${pattern}([\\s[<>"][^\\]]*)?\\s*\\]`, 'g');
		this.regexFile = new RegExp(`\\|\\s*(link|链接)=\\s*${pattern}\\s*(?=\\||]])`, 'g');
	}

	/**
	 * 解析形如外链的内链
	 * @param {string} anchor - 外链
	 * @returns {?string} - 内链主体
	 */
	convert(anchor) {
		if (anchor.startsWith('//')) {
			anchor = `https:${anchor}`; // eslint-disable-line no-param-reassign
		}
		const {pathname, search, searchParams, hash} = new URL(anchor),
			action = searchParams.get('action') ?? 'view';
		// 情形1: 不是index.php
		if (pathname.startsWith(this.script) && scripts.test(pathname.slice(this.script.length))) {
			console.log('不是index.php！');
			return null;
		} else if (this.variant && langs.test(pathname)) { // 情形2: 指定语言变种
			console.log(`指定语言变种：${pathname}`);
			return null;
		} else if (action !== 'view') { // 情形3: 不是view
			if (!actions.includes(action)) {
				console.log(`未识别的action参数：${action}`);
			}
			return null;
		} else if ([...searchParams.keys()].some(key => !keys.includes(key))) { // 情形4: 有未知的URL参数
			console.log('未识别的URL参数：', Object.fromEntries(searchParams));
			return null;
		}
		const oldid = searchParams.get('oldid'),
			diff = searchParams.get('diff'),
			curid = searchParams.get('curid');
		let decodedHash = hash
			&& decodeURIComponent(hash).replace(/\.([A-F0-9]{2})/g, (_, c) => decodeURIComponent(`%${c}`))
				.replace(/[|[\]{}&<]/g, c => encodeURI(c));
		if (diff) { // 情形5: 差异
			return oldid ? `Special:Diff/${oldid}/${diff}${decodedHash}` : `Special:Diff/${diff}${decodedHash}`;
		} else if (oldid) { // 情形6: 固定链接
			return `Special:PermaLink/${oldid}${decodedHash}`;
		} else if (curid) { // 情形7: 重定向到页面
			return `Special:Redirect/page/${curid}${decodedHash}`;
		}
		let title = searchParams.get('title'); // 情形8: 非空title参数
		if (!title) {
			if (pathname.startsWith(`${this.script}index.php`)) { // 情形9: /w/index.php/$1
				title = decodeURIComponent(pathname.slice(this.script.length + 10));
			} else if (pathname.startsWith(this.article)) { // 情形10: /wiki/$1
				title = decodeURIComponent(pathname.slice(this.article.length));
			} else {
				console.error(`未知情形：${pathname}${search}`);
			}
		}
		if (decodedHash.startsWith('#/media/File:')) {
			title = decodedHash.slice(8);
			decodedHash = '';
		}
		return title ? `${title}${decodedHash}` : null;
	}

	/**
	 * 将页面内的错误外链替换为内链
	 * @param {string} wikitext
	 * @returns {string}
	 */
	replace(wikitext) {
		return wikitext.replace(this.regex, (m, p1, p2) => {
			const link = this.convert(p1);
			if (link === null) {
				return m;
			}
			p2 = p2 && p2.trim(); // eslint-disable-line no-param-reassign
			const escaped = ns.test(link) ? `:${link}` : link;
			return p2 && p2 !== link ? `[[${escaped}|${p2}]]` : `[[${escaped}]]`;
		}).replace(this.regexFile, (m, p1, p2) => {
			const link = this.convert(p2);
			return link === null ? m : `|link=${link}`;
		});
	}
}

module.exports = WikiUrl;
