'use strict';
const {user, pin, url} = require('../config/user.json'),
	Api = require('../lib/api.js'),
	{runMode} = require('../lib/dev.js'),
	repeated = require('./repeated-CeL.js'),
	tag = require('./tag.js'),
	extImage = require('./extImage.js');

const api = new Api(user, pin, url);

(async () => {
	if (runMode()) {
		throw new RangeError('repeated-and-tag.js仅供cron自动执行，不可使用附加模式！');
	}
	await api.csrfToken();
	try {
		await repeated(api);
		console.log('repeated.js已执行！');
	} catch (e) {
		console.log('repeated.js执行过程中发生错误！');
		console.error(e);
	}
	try {
		await tag(api);
		console.log('tag.js已执行！');
	} catch (e) {
		console.log('tag.js执行过程中发生错误！');
		console.error(e);
	}
	try {
		await extImage(api);
		console.log('extImage.js已执行！');
	} catch (e) {
		console.log('extImage.js执行过程中发现错误！');
		console.error(e);
	}
})();
