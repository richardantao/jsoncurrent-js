import { describe, expect, it, vi } from "vitest";

import { Collector } from "../collector";
import { getPath, parsePath, setPath } from "../path";
import type { StreamingChunk } from "../types";

// ---------------------------------------------------------------------------
// parsePath
// ---------------------------------------------------------------------------

describe("parsePath", () => {
	it("parses a simple key", () => {
		expect(parsePath("title")).toEqual(["title"]);
	});

	it("parses nested keys", () => {
		expect(parsePath("meta.createdAt")).toEqual(["meta", "createdAt"]);
	});

	it("parses array index", () => {
		expect(parsePath("cards[0]")).toEqual(["cards", 0]);
	});

	it("parses nested key inside array element", () => {
		expect(parsePath("cards[2].term")).toEqual(["cards", 2, "term"]);
	});

	it("parses deeply nested path", () => {
		expect(parsePath("a.b[1].c.d[0]")).toEqual(["a", "b", 1, "c", "d", 0]);
	});
});

// ---------------------------------------------------------------------------
// getPath / setPath
// ---------------------------------------------------------------------------

describe("setPath / getPath round-trip", () => {
	it("sets and gets a top-level key", () => {
		const obj = {};
		setPath(obj, "title", "Hello");
		expect(getPath(obj, "title")).toBe("Hello");
	});

	it("sets and gets a nested key, creating intermediates", () => {
		const obj = {};
		setPath(obj, "meta.createdAt", "2025-01-01");
		expect(getPath(obj, "meta.createdAt")).toBe("2025-01-01");
	});

	it("sets and gets an array element", () => {
		const obj = {};
		setPath(obj, "cards", []);
		setPath(obj, "cards[0]", { term: "" });
		expect(getPath(obj, "cards[0]")).toEqual({ term: "" });
	});

	it("sets and gets a key inside an array element", () => {
		const obj = {};
		setPath(obj, "cards", [{}]);
		setPath(obj, "cards[0].term", "Mitosis");
		expect(getPath(obj, "cards[0].term")).toBe("Mitosis");
	});

	it("returns fallback for missing path", () => {
		expect(getPath({}, "missing.key", "default")).toBe("default");
	});
});

// ---------------------------------------------------------------------------
// Collector — basic ops
// ---------------------------------------------------------------------------

describe("Collector", () => {
	const make = <T>() => new Collector<T>();

	it("applies add op", () => {
		const c = make();
		c.consume({ path: "title", value: "Hello", op: "add" });
		expect(c.value).toEqual({ title: "Hello" });
	});

	it("applies append op", () => {
		const c = make();
		c.consume({ path: "title", value: "Hel", op: "add" });
		c.consume({ path: "title", value: "lo", op: "append" });
		expect(c.value).toEqual({ title: "Hello" });
	});

	it("applies insert op", () => {
		const c = make();
		c.consume({ path: "tags", value: [], op: "add" });
		c.consume({ path: "tags", value: "biology", op: "insert" });
		c.consume({ path: "tags", value: "cells", op: "insert" });
		expect(c.value).toEqual({ tags: ["biology", "cells"] });
	});

	it("emits change on each consume", () => {
		const onChange = vi.fn();
		const c = make();
		c.on("change", onChange);
		c.consume({ path: "title", value: "Hello", op: "add" });
		c.consume({ path: "title", value: " World", op: "append" });
		expect(onChange).toHaveBeenCalledTimes(2);
		expect(onChange).toHaveBeenLastCalledWith(
			{ title: "Hello World" },
			"title",
			"append",
		);
	});

	it("emits complete with final state", () => {
		const onComplete = vi.fn();
		const c = make();
		c.on("complete", onComplete);
		c.consume({ path: "title", value: "Hello", op: "add" });
		c.complete();
		expect(onComplete).toHaveBeenCalledWith({ title: "Hello" });
		expect(c.isComplete).toBe(true);
	});

	it("throws when consuming after complete", () => {
		const c = make();
		c.complete();
		expect(() => c.consume({ path: "title", value: "x", op: "add" })).toThrow();
	});

	it("resets correctly", () => {
		const c = make();
		c.consume({ path: "title", value: "Hello", op: "add" });
		c.complete();
		c.reset();
		expect(c.value).toEqual({});
		expect(c.isComplete).toBe(false);
	});

	it("each change event carries a new object reference", () => {
		const refs: object[] = [];
		const c = make();
		c.on("change", (s) => refs.push(s as object));
		c.consume({ path: "title", value: "A", op: "add" });
		c.consume({ path: "title", value: "B", op: "append" });
		expect(refs[0]).not.toBe(refs[1]);
	});
});

// ---------------------------------------------------------------------------
// Collector — middleware
// ---------------------------------------------------------------------------

describe("Collector middleware", () => {
	it("passes patch through by default", () => {
		const onChange = vi.fn();
		const c = new Collector();
		c.use((patch, next) => next(patch));
		c.on("change", onChange);
		c.consume({ path: "title", value: "Hello", op: "add" });
		expect(onChange).toHaveBeenCalledWith({ title: "Hello" }, "title", "add");
	});

	it("can drop a patch", () => {
		const onChange = vi.fn();
		const c = new Collector();
		c.use((_patch, _next) => {
			/* drop everything */
		});
		c.on("change", onChange);
		c.consume({ path: "title", value: "Hello", op: "add" });
		expect(onChange).not.toHaveBeenCalled();
	});

	it("can transform a patch", () => {
		const c = new Collector();
		c.use((patch, next) =>
			next({ ...patch, value: (patch.value as string).toUpperCase() }),
		);
		c.consume({ path: "title", value: "hello", op: "add" });
		expect(c.value).toEqual({ title: "HELLO" });
	});

	it("can fan out — mirror term to originalTerm", () => {
		const c = new Collector();
		c.use((patch, next) => {
			next(patch);
			if (patch.path.endsWith(".term")) {
				next({ ...patch, path: patch.path.replace(".term", ".originalTerm") });
			}
		});

		c.consume({ path: "cards[0].term", value: "Mito", op: "add" });
		c.consume({ path: "cards[0].term", value: "sis", op: "append" });

		expect(getPath(c.value, "cards[0].term")).toBe("Mitosis");
		expect(getPath(c.value, "cards[0].originalTerm")).toBe("Mitosis");
	});

	it("runs middleware in registration order", () => {
		const order: number[] = [];
		const c = new Collector();
		c.use((p, next) => {
			order.push(1);
			next(p);
		});
		c.use((p, next) => {
			order.push(2);
			next(p);
		});
		c.consume({ path: "x", value: 1, op: "add" });
		expect(order).toEqual([1, 2]);
	});
});

// ---------------------------------------------------------------------------
// Collector — nested structures (simulating real Vita output)
// ---------------------------------------------------------------------------

describe("Collector — nested streaming simulation", () => {
	it("reconstructs a flashcard set from a realistic patch sequence", () => {
		const c = new Collector();
		const patches: StreamingChunk[] = [
			{ path: "title", value: "", op: "add" },
			{ path: "title", value: "Cell Bio", op: "append" },
			{ path: "cards", value: [], op: "add" },
			{ path: "cards[0]", value: {}, op: "add" },
			{ path: "cards[0].term", value: "Mit", op: "append" },
			{ path: "cards[0].term", value: "osis", op: "append" },
			{ path: "cards[1]", value: {}, op: "add" },
			{ path: "cards[1].term", value: "Meiosis", op: "append" },
		];

		for (const p of patches) c.consume(p);

		expect(c.value).toMatchObject({
			title: "Cell Bio",
			cards: [{ term: "Mitosis" }, { term: "Meiosis" }],
		});
	});
});

// ---------------------------------------------------------------------------
// Collector — flush callback
// ---------------------------------------------------------------------------

describe("Collector — flush callback", () => {
	it("applies queued patches incrementally when flush is provided", async () => {
		const gates: Array<() => void> = [];
		const flush = vi.fn(
			() => new Promise<void>((resolve) => gates.push(resolve)),
		);
		const seen: string[] = [];

		const c = new Collector<{ title: string }>({ flush });
		c.on("change", (state) => {
			seen.push((state.title ?? "") as string);
		});

		c.consume({ path: "title", value: "A", op: "add" });
		c.consume({ path: "title", value: "B", op: "append" });
		c.consume({ path: "title", value: "C", op: "append" });

		expect(c.value).toEqual({ title: "ABC" });

		await Promise.resolve();

		expect(seen).toEqual(["A"]);
		expect(flush).toHaveBeenCalledTimes(1);

		gates[0]?.();
		await Promise.resolve();

		expect(seen).toEqual(["A", "AB"]);
		expect(flush).toHaveBeenCalledTimes(2);

		gates[1]?.();
		await Promise.resolve();

		expect(seen).toEqual(["A", "AB", "ABC"]);
	});

	it("drains queued changes immediately before complete", async () => {
		const gates: Array<() => void> = [];
		const flush = vi.fn(
			() => new Promise<void>((resolve) => gates.push(resolve)),
		);
		const onComplete = vi.fn();
		const onChange = vi.fn();

		const c = new Collector<{ title: string }>({ flush });
		c.on("complete", onComplete);
		c.on("change", onChange);

		c.consume({ path: "title", value: "A", op: "add" });
		c.consume({ path: "title", value: "B", op: "append" });
		await Promise.resolve();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onComplete).not.toHaveBeenCalled();

		c.complete();

		expect(onChange).toHaveBeenCalledTimes(2);
		expect(onChange).toHaveBeenLastCalledWith(
			{ title: "AB" },
			"title",
			"append",
		);
		expect(onComplete).toHaveBeenCalledOnce();
		expect(onComplete).toHaveBeenCalledWith({ title: "AB" });
		expect(c.isComplete).toBe(true);
	});
});
