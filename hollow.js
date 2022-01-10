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
	const regex1 = /{{\s*背景[圖图]片\s*\|([\s\S]+?)}}/, // 捕获定制的背景图片
		regex2 = /{{\s*背景[圖图]片\s*\|?}}/g, // 错误模板用法
		regex3 = /{{\s*空洞[骑騎]士\s*(?:\|[\s\S]*?)?(?=}})/, // 匹配大家族模板（不含右半}}）
		// 匹配无效的背景图片参数
		regex4 = /\|\s*logo-(?:url|size)\s*=[\s\S]*(?=\||$)/g,
		pages = await api.search('hastemplate:"空洞骑士" insource:"背景图片"');
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
			const params = template[1].replace(regex4, '');
			if (params.includes('|')) { // 额外规定了背景图片的有效参数
				error(`页面 ${pageid} 无法修复！`);
			} else { // 将背景图片合并至大家族模板
				const image = params.replace(/^(?:file:|url\s*=)\s*/i, '').trim();
				if (/^[Bb]anner[ _]type[ _]02-1.jpg$/.test(image)) { // 默认背景
					text = content.replace(regex1, '');
				} else {
					text = content.replace(regex1, '').replace(regex3, `$&|背景图片=${image}`);
				}
			}
		}
		return [pageid, content, text];
	}).filter(page => page);
	await api.massEdit(list, mode, '自动修复被大家族模板覆盖的背景图片');
	info('检查完毕！');
})();