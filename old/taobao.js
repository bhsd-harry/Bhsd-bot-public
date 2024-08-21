'use strict';

const Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	Parser = require('wikiparser-node');
Parser.warning = false;
Parser.config = './config/moegirl';

const spams = [
		'*.taobao.com', '*.tmall.com', '*.fanbox.cc', '*.modian.com', 'pan.baidu.com', '*.popiask.cn', '*.peing.net',
		'*.marshmallow-qa.com', '*.tapechat.net', '*.booth.pm', '*.amazon.co.jp', '*.afdian.net', '*.wj.qq.com',
		'*.wjx.cn',
	],
	paths = [
		null, null, null, null, null, null, null, null, null,
		/^\/(.+\/)?items\b/, /^\/(registry|hz)\/wishlist\b/, /^\/@/, null, null,
	],
	[,,, index = 0] = process.argv,
	targetPath = paths.at(index),
	skip = [196275, 321048, 347990];
let geuquery = spams.at(index);

/**
 * @param {URL} href 
 * @param {Parser.Token} token 
 */
const remove = (href, token) => {
	const {host, pathname} = href;
	if (host.endsWith(geuquery) && (!targetPath || targetPath.test(pathname))) {
		if (token.type === 'image-parameter') {
			token.setValue('');
			return;
		}
		const ref = token.closest('ext#ref'),
			{previousElementSibling, nextSibling, parentNode, eof} = token,
			{childNodes} = parentNode,
			i = childNodes.indexOf(token),
			j = childNodes.indexOf(previousElementSibling);
		token.remove();
		if (previousElementSibling?.type === 'list'
			&& (eof || nextSibling?.type === 'text' && String(nextSibling).startsWith('\n'))
		) {
			if (!eof) {
				parentNode.setText(nextSibling.slice(1), i);
			}
			for (let k = i - 1; k >= j; k--) {
				parentNode.removeAt(k);
			}
		}
		if (ref && !ref.innerText.trim()) {
			ref.remove();
		}
	}
};

const main = async (api = new Api(user, pin, url)) => {
	const mode = runMode();
	let edits;
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
		if (mode !== 'rerun') {
			const params = {geuquery, geulimit: 500, geuexpandurl: 1},
				pages = [
					...(await api.extSearch({...params, geuprotocol: 'http'}))[0],
					...(await api.extSearch({...params, geuprotocol: 'https'}))[0],
				].filter(({pageid}) => !skip.includes(pageid));
			if (geuquery.startsWith('*.')) {
				geuquery = geuquery.replace('*.', '');
				pages.push(
					...(await api.extSearch({...params, geuprotocol: 'http'}))[0],
					...(await api.extSearch({...params, geuprotocol: 'https'}))[0],
				);
			}
			edits = pages.filter(({pageid}, i) => pages.findLastIndex(({pageid: id}) => id === pageid) === i)
				.map(({pageid, content, timestamp, curtimestamp}) => {
					const root = Parser.parse(content, false, 10);
					for (const template of root.querySelectorAll(String.raw`template#Template\:Cite_web`)) {
						const val = template.getValue('url');
						if (val) {
							try {
								const href = new URL(val);
								remove(href, template);
							} catch {}
						}
					}
					for (const extlink of root.querySelectorAll('ext-link, free-ext-link')) {
						const href = extlink.getUrl();
						remove(href, extlink);
					}
					for (const imgParam of root.querySelectorAll('image-parameter#link')) {
						let {link} = imgParam;
						if (typeof link !== 'string') {
							continue;
						} else if (link.startsWith('//')) {
							link = `https:${link}`;
						}
						try {
							const href = new URL(link);
							remove(href, imgParam);
						} catch {}
					}
					return [pageid, content, String(root), timestamp, curtimestamp];
				}).filter(([, content, text]) => text !== content);
		}
	}
	await api.massEdit(edits, mode, `自动清理垃圾链接 ${geuquery}`);
};

main();
