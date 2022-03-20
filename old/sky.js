/**
 * @Function: 1. 检查嵌入了{{Sky光·遇}}的条目，如果模板默认背景覆盖了定制背景则进行修复
 */
'use strict';
const {user, pin, url} = require('../config/user.json'),
	Api = require('../lib/api.js'),
	{info, error, trim, runMode} = require('../lib/dev.js');

const api = new Api(user, pin, url);

(async () => {
	const mode = runMode();
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	if (mode === 'rerun') {
		await api.massEdit(null, mode, '自动修复被大家族模板覆盖的背景图片');
		return;
	}
	const regex1 = /{{[\s\u200e]*背景[圖图]片[\s\u200e]*\|([\s\S]+?)}}/, // 捕获定制的背景图片
		regex2 = /{{[\s\u200e]*背景[圖图]片[\s\u200e]*\|?\s*}}/g, // 错误模板用法
		regex3 = /{{[\s\u200e]*(?:[Ss]ky光·遇|光遇)[\s\u200e]*(?:\|[\s\S]*?)?(?=}})/, // 匹配大家族模板（不含右半}}）
		// 匹配无效的背景图片参数
		regex4 = /\|\s*(?:color\s*=\s*#(?:99[Cc][Cc][Ff][Ff]|9[Cc][Ff])|animate\s*=\s*appear)\s*(?=\||$)/g,
		pages = await api.search('hastemplate:"Sky光·遇" insource:"背景图片"');
	const list = pages.map(({pageid, content}) => {
		const template = content.match(regex1);
		let text;
		if (regex2.test(content)) { // 错误模板用法
			text = content.replace(regex2, '');
		} else if (!template) { // 未知原因
			error(`页面 ${pageid} 未找到直接引用的背景图片模板！`);
			return null;
		} else if (!regex3.test(content)) { // 未出现过此种情形
			error(`页面 ${pageid} 未找到直接引用的大家族模板！`);
			return null;
		} else {
			const params = template[1].replace(regex4, ''),
				image = trim(params.replace(/^(?:file:|url\s*=)\s*/i, ''));
			if (image !== '光遇背景-主.jpg') { // 非默认背景或额外规定了背景图片的有效参数
				const nav = content.match(regex3);
				if (/\|\s*2\s*=/.test(nav[0]) || nav[0].match(/\|/g).length > 1) { // 已修复
					info(`页面 ${pageid} 已修复！`);
					return null;
				}
				text = content.replace(regex3, '$&|2=');
			} else { // 将背景图片合并至大家族模板
				text = content.replace(regex1, '');
			}
		}
		return [pageid, content, text];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复被大家族模板覆盖的背景图片');
})();
