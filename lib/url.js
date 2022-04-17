const {urlRegex, escapeRegExp} = require('./dev');

const scripts = /^\/(?:api|load|thumb|img_auth|rest)\.php[/?]/,
	keys = ['action', 'title', 'oldid', 'diff', 'curid'],
	langs = /^\/zh(?:-(?:han[st]|cn|my|sg|tw|hk|mo))?\//;

class WikiUrl {
	/**
	 * @param {string} wgServer
	 * @param {string} wgScript - 以'/'开头的wgScriptPath常数
	 * @example
	 * '/mediawiki'; // LLWiki
	 * '/'; // 萌娘百科
	 * '/w'; // 维基百科
	 * @param {string} wgArticlePath - 以'/'开头的wgArticlePath常数
	 * @example
	 * '/zh'; // LLWiki
	 * '/'; // 萌娘百科
	 * '/wiki'; // 维基百科
	 * @param {boolean} wgVariantArticlePath
	 */
	constructor(wgServer, wgScriptPath, wgArticlePath = wgScriptPath, wgVariantArticlePath = true) {
		if (!wgScriptPath.startsWith('/')) {
			throw new RangeError('常数 wgScriptPath 必须以"/"开头！');
		} else if (!wgArticlePath.startsWith('/')) {
			throw new RangeError('常数 wgArticlePath 必须以"/"开头！');
		}
		this.script = wgScriptPath;
		this.article = wgArticlePath;
		this.variant = wgVariantArticlePath;
		this.regex = new RegExp(
			`\\[\\s*((?:https?:)?//${escapeRegExp(wgServer)}/${urlRegex}+)(?:\\s+([^\\]]+))?\\s*\\]`,
			'g',
		);
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
			console.log('指定语言变种！');
			return null;
		} else if (action !== 'view') { // 情形3: 不是view
			console.log(`未识别的action参数：${action}`);
			return null;
		} else if ([...searchParams.keys()].some(key => !keys.includes(key))) { // 情形4: 有未知的URL参数
			console.log('未识别的URL参数：', Object.fromEntries(searchParams));
			return null;
		}
		const oldid = searchParams.get('oldid'),
			diff = searchParams.get('diff'),
			curid = searchParams.get('curid');
		if (diff) { // 情形5: 差异
			return oldid ? `Special:Diff/${oldid}/${diff}${hash}` : `Special:Diff/${diff}${hash}`;
		} else if (oldid) { // 情形6: 固定链接
			return `Special:PermaLink/${oldid}${hash}`;
		} else if (curid) { // 情形7: 重定向到页面
			return `Special:Redirect/page/${curid}${hash}`;
		}
		let title = searchParams.get('title'); // 情形8: 非空title参数
		if (!title) {
			if (pathname.startsWith(`${this.script}/index.php`)) { // 情形9: /w/index.php/$1
				title = decodeURIComponent(pathname.slice(this.script.length + 11));
			} else if (pathname.startsWith('wgArticlePath')) { // 情形10: /wiki/$1
				title = decodeURIComponent(pathname.slice(this.article.length + 1));
			}
		}
		console.error(`未知情形：${pathname}${search}`);
		return title ? `${title}${hash}` : null;
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
			return p2 ? `[[${link}|${p2}]]` : `[[${link}]]`;
		});
	}
}

module.exports = WikiUrl;
