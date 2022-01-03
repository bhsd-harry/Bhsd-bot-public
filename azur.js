/**
 * @Function: 1. 检查嵌入了{{碧蓝航线}}的条目，如果模板默认背景覆盖了定制背景则进行修复
 */
'use strict';
const {user, pin} = require('./user.json'),
	Api = require('./api.js'),
	{info, error} = require('./dev.js');

const url = 'https://zh.moegirl.org.cn',
	api = new Api(user, pin, url),
	[,, mode] = process.argv;

(async () => {
	if (mode !== 'dry') {
		await api.csrfToken();
	}
	const regex1 = /{{\s*(?:碧[蘭蓝]航[線线])?背景[圖图]片\s*\|(.+?)}}/,
		regex2 = /{{\s*碧[蘭蓝]航[線线]\s*(?:\|.*?)?}}/,
		regex3 = /\|\s*(?!position\s*=\s*(?:center|50%)\s*(?:center|50%)?\s*(?:\||}}))/,
		pages = await api.search('hastemplate:"碧蓝航线" insource:"背景图片"');
	const list = pages.map(({pageid, content}) => {
		const raw = content.match(regex1);
		if (!raw) {
			error(`页面 ${pageid} 未找到直接引用的背景图片模板！`);
			return null;
		}
		if (!regex2.test(content)) {
			error(`页面 ${pageid} 未找到大家族模板！`);
			return null;
		}
		let text;
		if (regex3.test(raw[1])) { // 额外规定了背景图片样式
			const nav = content.match(regex2);
			if (/\|\s*无背景\s*=/.test(nav[0])) { // 已修复
				error(`页面 ${pageid} 已修复！`);
				return null;
			}
			text = content.replace(regex2, p => `${p.slice(0, -2)}|无背景=1}}`);
		} else { // eslint-disable-line no-else-return
			const image = raw[1].replace(regex3, '').replace(/^(?:file:|url\s*=)\s*/i, '');
			text = content.replace(regex1, '').replace(regex2, p => `${p.slice(0, -2)}|2=${image}}}`);
		}
		return [pageid, content, text];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复被大家族模板覆盖的背景图片');
	info('检查完毕！');
})();