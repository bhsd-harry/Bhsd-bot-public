'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{runMode} = require('../lib/dev'),
	scripts = [
		'duplicated',
		'tag',
		'extImage',
		'wrongUrl',
		'removeInUse',
		'wrongInternal',
		'css',
		'doc',
		'bracket',
		'br',
		'duplicated-image-parameter',
		'bold',
		'duplicated-category',
		'selflink',
	];

const api = new Api(user, pin, url);

const _execute = async script => {
	try {
		await require(`./${script}`)(api);
		console.log(`${script}.js已执行！`);
	} catch (e) {
		console.log(`${script}.js执行过程中发生错误！`);
		if (e.message === '请求超时！') {
			throw e;
		}
		console.error(e);
	}
};

(async () => {
	const mode = runMode();
	if (mode !== 'run') {
		throw new RangeError('仅供cron自动执行，不可使用附加模式！');
	}
	await api[mode === 'dry' ? 'login' : 'csrfToken']();
	for (const script of scripts) {
		await _execute(script);
	}
})();
