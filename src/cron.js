'use strict';
const {user, pin, url} = require('../config/user'),
	Api = require('../lib/api'),
	{runMode, sleep, info} = require('../lib/dev'),
	scripts = [
		'repeated-node',
		'tag',
		'extImage',
		'wrongUrl',
		'removeInUse',
		'wrongInternal',
		'http',
	];

const api = new Api(user, pin, url);

const _login = async mode => {
	try {
		await api[mode === 'dry' ? 'login' : 'csrfToken']();
	} catch (e) {
		if (e.statusCode === 502) {
			info('登入时触发http代码502！将于1分钟后再次尝试。');
			await sleep(60);
			return _login(mode);
		}
		throw e;
	}
};

const _execute = async script => {
	try {
		await require(`./${script}`)(api);
		console.log(`${script}.js已执行！`);
	} catch (e) {
		console.log(`${script}.js执行过程中发生错误！`);
		console.error(e);
	}
};

(async () => {
	const mode = runMode();
	if (mode) {
		throw new RangeError('仅供cron自动执行，不可使用附加模式！');
	}
	await _login(mode);
	for (const script of scripts) {
		await _execute(script); // eslint-disable-line no-await-in-loop
	}
})();
