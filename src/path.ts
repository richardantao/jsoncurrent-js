/**
 * Parse a dot-notation path string with array indices into a key array.
 * Returns an empty array for an empty string path.
 *
 * @example
 * parsePath('sections[0].heading') // ['sections', 0, 'heading']
 * parsePath('meta.createdAt') // ['meta', 'createdAt']
 * parsePath('sections[2]')      // ['sections', 2]
 * parsePath('')              // []
 */
export function parsePath(path: string): (string | number)[] {
	if (path === "") return [];
	return path.split(".").flatMap((segment) => {
		const match = segment.match(/^(\w+)\[(\d+)\]$/);
		if (match?.[1] && match[2]) return [match[1], parseInt(match[2], 10)];
		// bare array index segment e.g. from a root-level '[0]'
		const indexOnly = segment.match(/^\[(\d+)\]$/);
		if (indexOnly?.[1]) return [parseInt(indexOnly[1], 10)];
		return [segment];
	});
}

/**
 * Get a value at a dot-notation path, returning `fallback` if any segment
 * is missing or null.
 */
export function getPath(
	obj: unknown,
	path: string,
	fallback?: unknown,
): unknown {
	const keys = parsePath(path);
	if (keys.length === 0) return obj ?? fallback;
	let current: unknown = obj;

	for (const key of keys) {
		if (current == null || typeof current !== "object") return fallback;
		current = (current as Record<string | number, unknown>)[key];
	}

	return current ?? fallback;
}

/**
 * Set a value at a dot-notation path, creating intermediate objects or arrays
 * as needed based on whether the next key is a number (array) or string
 * (object).
 *
 * Mutates `obj` in place.
 */
export function setPath(obj: unknown, path: string, value: unknown): void {
	const keys = parsePath(path);
	if (keys.length === 0) return; // empty path — no-op

	let current = obj as Record<string | number, unknown>;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i] as string | number;
		const nextKey = keys[i + 1] as string | number;

		if (current[key] == null || typeof current[key] !== "object") {
			// create array or object depending on what the next key looks like
			current[key] = typeof nextKey === "number" ? [] : {};
		}

		current = current[key] as Record<string | number, unknown>;
	}

	current[keys[keys.length - 1] as string | number] = value;
}
