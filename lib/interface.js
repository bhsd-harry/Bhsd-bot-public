'use strict';
const readline = require('readline'),
	events = require('events');

class Interface {
	template;
	active;
	#queue;
	#em;
	#rl;

	constructor(func = str => str) {
		this.template = func;
		this.active = false;
		this.#queue = [];
		this.#rl = readline.createInterface(process.stdin, process.stdout);
		this.#rl.pause();
		this.#em = new events.EventEmitter();
		this.#em.setMaxListeners(20);
		this.#em.on('next', async () => {
			if (this.#queue.length === 0) {
				this.active = false;
				return;
			}
			const [q, followup] = this.#queue.shift();
			this.active = q;
			let ans = await this.#question(this.template(q));
			if (ans in followup) {
				const more = followup[ans];
				ans = [];
				for (const question of more) {
					ans.push(await this.#question(question)); // eslint-disable-line no-await-in-loop
				}
			}
			this.#rl.pause();
			this.#em.emit('answer', {q, ans});
			this.#em.emit('next');
		});
	}

	#question(q) {
		return new Promise(resolve => {
			this.#rl.question(`${q}\n`, ans => {
				resolve(ans);
			});
		});
	}

	set(func) {
		this.template = func;
	}

	destroy() {
		this.#em.removeAllListeners();
		this.#rl.close();
		this.#queue.length = 0;
	}

	push(question, followup = {}) {
		question = String(question); // eslint-disable-line no-param-reassign
		return new Promise(resolve => {
			if (this.active !== question && !this.#queue.includes(question)) {
				this.#queue.push([question, followup]);
			}
			const callback = ({q, ans}) => {
				if (question === q) {
					this.#em.off('answer', callback);
					resolve(ans);
				}
			};
			this.#em.on('answer', callback);
			if (this.active === false && this.#queue.length === 1) {
				this.#em.emit('next');
			}
		});
	}
}

module.exports = Interface;
