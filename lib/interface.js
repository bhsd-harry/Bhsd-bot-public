const readline = require('readline'),
	events = require('events');

class Interface {
	template;
	active;
	#queue;
	#em;
	#rl;

	constructor(func = str => `${str}\n`) {
		this.template = func;
		this.active = false;
		this.#queue = [];
		this.#rl = readline.createInterface(process.stdin, process.stdout);
		this.#rl.pause();
		this.#em = new events.EventEmitter();
		this.#em.on('next', () => {
			if (this.#queue.length === 0) {
				this.active = false;
				return;
			}
			this.active = this.#queue.shift();
			this.#rl.question(this.template(this.active), ans => {
				this.#rl.pause();
				this.#em.emit('answer', {q: this.active, ans});
				this.#em.emit('next');
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

	push(question) {
		question = String(question); // eslint-disable-line no-param-reassign
		return new Promise(resolve => {
			if (this.active !== question && !this.#queue.includes(question)) {
				this.#queue.push(question);
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
