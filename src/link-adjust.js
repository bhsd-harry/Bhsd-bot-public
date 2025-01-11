'use strict';

const Parser = require('wikiparser-node');
const Api = require('../lib/api');
const {runMode, ping} = require('../lib/dev');
const {user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

/** @link https://github.com/lihaohong6/MGP-bots/blob/master/bots/link_adjust.py */
const ytParams = ['feature', 'ab_channel', 'si'],
	bbParams = [
		'from',
		'seid',
		'spm_id_from',
		'vd_source',
		'from_spmid',
		'referfrom',
		'bilifrom',
		'share_source',
		'share_medium',
		'share_plat',
		'share_session_id',
		'share_tag',
		'share_times',
		'timestamp',
		'bbid',
		'ts',
		'from_source',
		'broadcast_type',
		'is_room_feed',
		'msource',
		'noTitleBar',
		'hasBack',
		'jumpLinkType',
		'timestamp',
		'unique_k',
		'goFrom',
		'ftype',
		'otype',
		'ctype',
		'share_from',
		'is_story_h5',
		'mid',
		'native.theme',
		'night',
		'a_id',
		's_id',
		'buvid',
		'up_id',
		'plat_id',
		'rt',
		'tdsourcetag',
		'accept_quality',
		'current_qn',
		'current_quality',
		'playurl_h264',
		'playurl_h265',
		'quality_description',
		'network',
		'network_status',
		'platform_network_status',
		'p2p_type',
		'visit_id',
		'bsource',
		'spm',
		'hotRank',
		'-Arouter',
		'type',
		'session_id',
		'theme',
		'spmid',
	];

const main = async (api = new Api(user, pin, url)) => {
	const targets = Object.entries(lintErrors).filter(([, {errors}]) => errors.some(
		({message}) => message === '无用的链接参数' || message === '待修正的链接',
	));
	if (targets.length === 0) {
		return;
	}
	// eslint-disable-next-line prefer-const
	let mode = runMode();
	if (mode === 'run') {
		// mode = 'dry';
	}
	if (mode !== 'redry') {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	}
	if (mode === 'rerun' || mode === 'redry') {
		await api.massEdit(null, mode, '自动移除无用的链接参数');
		return;
	}
	const edits = [],
		pages = await api.revisions({pageids: targets.map(([pageid]) => pageid)});
	for (const {pageid, ns, content, timestamp, curtimestamp} of pages) {
		const root = Parser.parse(content, ns === 10, 9),
			/** @type {(Parser.ExtLinkToken | Parser.MagicLinkToken)[]} */
			links = root.querySelectorAll('ext-link,free-ext-link');
		for (const token of links) {
			try {
				let /** @type {URL} */ uri = token.getUrl();
				if (['b23.tv', 'bili2233.cn', 'youtu.be'].includes(uri.hostname)) {
					try {
						await ping(uri.toString());
					} catch (e) {
						if (Array.isArray(e)) {
							uri = new URL(e[1]);
							token.setTarget(e[1]);
						}
					}
				}
				const {hostname, pathname, searchParams} = uri;
				if (
					pathname === '/watch'
					&& /^(?:w{3}\.)?youtube\.com$/u.test(hostname)
					&& ytParams.some(p => searchParams.has(p))
				) {
					for (const p of ytParams) {
						searchParams.delete(p);
					}
					token.setTarget(uri.toString());
				} else if (!/(?:^|\.)bilibili\.com$/u.test(hostname)) {
					// pass
				} else if (/^\/read\/mobile(?:$|\/)/u.test(pathname)) {
					const id = searchParams.get('id') ?? /\/(\d+)/u.exec(pathname)?.[1];
					if (id) {
						uri.pathname = `/read/cv${id}`;
						uri.search = '';
						token.setTarget(uri.toString());
					}
				} else if (bbParams.some(p => searchParams.has(p))) {
					for (const p of bbParams) {
						searchParams.delete(p);
					}
					token.setTarget(uri.toString());
				}
			} catch {}
		}
		const text = String(root);
		if (content !== text) {
			edits.push([pageid, content, text, timestamp, curtimestamp]);
		}
	}
	await api.massEdit(edits, mode, '自动移除无用的链接参数');
};

if (!module.parent) {
	main();
}

module.exports = main;
