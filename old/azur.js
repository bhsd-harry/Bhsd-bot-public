/**
 * @Function: 1. 检查嵌入了{{碧蓝航线}}的条目，如果模板默认背景覆盖了定制背景则进行修复
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
	const regex1 = /{{[\s\u200e]*(?:碧[蘭蓝]航[線线])?背景[圖图]片[\s\u200e]*\|([\s\S]+?)}}/, // 捕获定制的背景图片
		regex2 = /{{[\s\u200e]*(?:碧[蘭蓝]航[線线])?背景[圖图]片[\s\u200e]*\|?[\s\u200e]*}}/g, // 错误模板用法
		regex3 = /{{[\s\u200e]*碧[蘭蓝]航[線线][\s\u200e]*(?:\|[\s\S]*?)?(?=}})/, // 匹配大家族模板（不含右半}}）
		// 匹配无效的背景图片参数
		regex4 = /\|\s*(?:position\s*=\s*center|logo-url\s*=[\s\S]*?|logo-size\s*=\s*contain)\s*(?=\||$)/g,
		pages = await api.search('hastemplate:"碧蓝航线" insource:"背景图片"');
	const list = pages.map(({pageid, content, timestamp, curtimestamp}) => {
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
			const params = template[1].replace(regex4, '');
			if (params.includes('|')) { // 额外规定了背景图片的有效参数
				const nav = content.match(regex3);
				if (/\|\s*无背景\s*=/.test(nav[0])) { // 已修复
					info(`页面 ${pageid} 已修复！`);
					return null;
				}
				text = content.replace(regex3, '$&|无背景=1');
			} else { // 将背景图片合并至大家族模板
				const image = trim(params.replace(/^(?:file:|url\s*=)\s*/i, ''));
				text = content.replace(regex1, '').replace(regex3, `$&|2=${image}`);
			}
		}
		return [pageid, content, text, timestamp, curtimestamp];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复被大家族模板覆盖的背景图片');
})();
