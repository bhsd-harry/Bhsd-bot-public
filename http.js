/**
 * @Function: 用于修复http链接
 */
'use strict';
const Api = require('./api.js'),
	{user, pin} = require('./user.json'),
	{ping} = require('./dev.js');

const api = new Api(user, pin, 'https://zh.moegirl.org.cn'),
	[,, mode] = process.argv;

(async () => {
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	const ext = (await api.taggedRecentChanges('非https地址插入')).filter(({content}) => content.includes('http://'));
	ext.forEach(ele => {
		ele.domain = (ele.content.match(/(?<=http:\/\/)[A-Za-z0-9.]+/g) || []).filter(site => site.includes('.'));
	});
	const domains = [...new Set(ext.map(({domain}) => domain).flat())],
		responses = await Promise.allSettled(domains.map(ele => ping(`https://${ele}`)));
	const https = responses.filter(({status}) => status === 'fulfilled').map(({value}) => value.slice(8));
	ext.forEach(ele => {
		ele.domain = ele.domain.filter(site => https.includes(site));
	});
	const known = ext.filter(({domain}) => domain.length > 0),
		edits = known.map(({pageid, content, domain}) => {
		let text = content;
		domain.forEach(site => {
			text = text.replaceAll(`http://${site}`, `https://${site}`);
		});
		if (text === content) {
			return null;
		}
		return [pageid, content, text];
	}).filter(edit => edit);
	api.massEdit(edits, mode, '自动修复http链接');
})();