'use strict';

const Parser = require('wikiparser-node'),
	Api = require('../lib/api'),
	{save} = require('../lib/dev'),
	{user, pin, url} = require('../config/user'),
	lintErrors = require('../config/lintErrors');
Parser.warning = false;
Parser.config = './config/moegirl';

(async (api = new Api(user, pin, url)) => {
	await api.login();
	const qs = {
			generator: 'recentchanges', grcnamespace: 0, grclimit: 500, grctype: 'edit|new',
			grcexcludeuser: 'Bhsd', grcend: new Date(Date.now() - 3600 * 1000).toISOString(),
		},
		pages = await api.revisions(qs);
	for (const {pageid, title, content} of pages) {
		const errors = Parser.parse(content).lint();
		if (errors.length > 0) {
			lintErrors[pageid] = {title, errors};
		}
	}
	await save('../config/lintErrors.json', lintErrors);
})();
