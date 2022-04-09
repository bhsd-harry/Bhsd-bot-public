'use strict';
const {user, pin, url} = require('../config/user.json'),
	Api = require('../lib/api.js'),
	{info, error, runMode} = require('../lib/dev.js'),
	repeated = require('./repeated.js'),
	tag = require('./tag.js');

const api = new Api(user, pin, url);

(async () => {
	if (runMode()) {
		throw new RangeError('repeated-and-tag.js仅供cron自动执行，不可使用附加模式！');
	}
	await api.csrfToken();
	try {
		await repeated(api);
		info('repeated.js已执行！');
	} catch (e) {
		error('repeated.js执行过程中发生错误！');
		console.error(e);
	}
	try {
		await tag(api);
		info('tag.js已执行！');
	} catch (e) {
		error('tag.js执行过程中发生错误！');
		console.error(e);
	}
})();
