type Listener = { bivarianceHack(...args: unknown[]): void }["bivarianceHack"];

/**
 * Minimal typed event emitter.
 * Subclasses narrow the event map via the generic parameter.
 *
 * @example
 * class Foo extends TypedEmitter<{ change: (v: string) => void }> {}
 * const foo = new Foo();
 * foo.on('change', (v) => console.log(v));
 * foo.emit('change', 'hello');
 */
export class TypedEmitter<Events extends { [K in keyof Events]: Listener }> {
	private listeners = new Map<keyof Events, Events[keyof Events][]>();

	on<K extends keyof Events>(event: K, fn: Events[K]): this {
		const existing = this.listeners.get(event) ?? [];
		this.listeners.set(event, [...existing, fn]);
		return this;
	}

	off<K extends keyof Events>(event: K, fn: Events[K]): this {
		const existing = this.listeners.get(event) ?? [];
		this.listeners.set(
			event,
			existing.filter(l => l !== fn)
		);
		return this;
	}

	once<K extends keyof Events>(event: K, fn: Events[K]): this {
		const wrapper = ((...args: Parameters<Events[K]>) => {
			this.off(event, wrapper as Events[K]);
			fn(...args);
		}) as Events[K];
		return this.on(event, wrapper);
	}

	protected emit<K extends keyof Events>(
		event: K,
		...args: Parameters<Events[K]>
	): void {
		const fns = (this.listeners.get(event) ?? []) as Events[K][];
		for (const fn of fns) {
			try {
				fn(...args);
			} catch (err) {
				// Prevent a bad listener from breaking the parse loop.
				// Surface as an unhandled rejection in dev so it's not silent.
				Promise.reject(err);
			}
		}
	}

	removeAllListeners(event?: keyof Events): this {
		if (event) {
			this.listeners.delete(event);
		} else {
			this.listeners.clear();
		}
		return this;
	}
}