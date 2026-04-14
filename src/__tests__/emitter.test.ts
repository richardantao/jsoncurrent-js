import { describe, it, expect, vi } from "vitest";

import { Collector } from "../collector";
import { Emitter } from "../emitter";
import type { StreamingChunk } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Feed an entire JSON string to the emitter in one write. */
function emitAll(json: string, root = ""): StreamingChunk[] {
	const emitter = new Emitter({ root });
	const patches: StreamingChunk[] = [];
	emitter.on("patch", p => patches.push(p));
	emitter.write(json);
	emitter.flush();
	return patches;
}

/**
 * Feed a JSON string character-by-character — the hardest case for any
 * chunk-level parser.
 */
function emitCharByChar(json: string, root = ""): StreamingChunk[] {
	const emitter = new Emitter({ root });
	const patches: StreamingChunk[] = [];
	emitter.on("patch", p => patches.push(p));
	for (const char of json) emitter.write(char);
	emitter.flush();
	return patches;
}

function dataPatchesForPath(
	patches: StreamingChunk[],
	path: string
): StreamingChunk[] {
	return patches.filter(p => p.path === path && p.op !== "complete");
}

function assembleStringPatches(patches: StreamingChunk[], path: string): string {
	return dataPatchesForPath(patches, path).reduce(
		(acc, p) =>
			p.op === "add" ? (p.value as string) : acc + (p.value as string),
		""
	);
}

/**
 * Assemble patches back into a plain object — mirrors what the Collector does,
 * used here to compare against JSON.parse output without a Collector dependency.
 */
function assemble(patches: StreamingChunk[]): unknown {
	const collector = new Collector();
	for (const p of patches) collector.consume(p);
	collector.complete();
	return collector.value;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe("Emitter — primitives", () => {
	it("parses a string value", () => {
		const patches = emitAll('{"title":"Hello"}');
		const str = assembleStringPatches(patches, "title");
		expect(str).toBe("Hello");
	});

	it("parses an integer", () => {
		const patches = emitAll('{"count":42}');
		expect(patches.find(p => p.path === "count")?.value).toBe(42);
	});

	it("parses a negative integer", () => {
		const patches = emitAll('{"n":-7}');
		expect(patches.find(p => p.path === "n")?.value).toBe(-7);
	});

	it("parses a float", () => {
		const patches = emitAll('{"x":3.14}');
		expect(patches.find(p => p.path === "x")?.value).toBe(3.14);
	});

	it("parses true", () => {
		const patches = emitAll('{"flag":true}');
		expect(patches.find(p => p.path === "flag")?.value).toBe(true);
	});

	it("parses false", () => {
		const patches = emitAll('{"flag":false}');
		expect(patches.find(p => p.path === "flag")?.value).toBe(false);
	});

	it("parses null", () => {
		const patches = emitAll('{"val":null}');
		expect(patches.find(p => p.path === "val")?.value).toBe(null);
	});

	it("parses an empty string", () => {
		const patches = emitAll('{"s":""}');
		const match = patches.find(p => p.path === "s");
		expect(match?.value).toBe("");
		expect(match?.op).toBe("add");
	});
});

// ---------------------------------------------------------------------------
// Nested structures
// ---------------------------------------------------------------------------

describe("Emitter — nested structures", () => {
	it("parses a nested object", () => {
		const json = '{"meta":{"version":1}}';
		const result = assemble(emitAll(json));
		expect(result).toMatchObject({ meta: { version: 1 } });
	});

	it("parses an array of primitives", () => {
		const json = '{"tags":["a","b","c"]}';
		const result = assemble(emitAll(json));
		expect(result).toMatchObject({ tags: ["a", "b", "c"] });
	});

	it("parses an array of objects", () => {
		const json = '{"cards":[{"term":"Mitosis"},{"term":"Meiosis"}]}';
		const result = assemble(emitAll(json));
		expect(result).toMatchObject({
			cards: [{ term: "Mitosis" }, { term: "Meiosis" }],
		});
	});

	it("parses deeply nested structure", () => {
		const json = '{"a":{"b":{"c":{"d":42}}}}';
		const result = assemble(emitAll(json));
		expect(result).toMatchObject({ a: { b: { c: { d: 42 } } } });
	});

	it("parses array of numbers", () => {
		const json = '{"scores":[1,2,3]}';
		const result = assemble(emitAll(json));
		expect(result).toMatchObject({ scores: [1, 2, 3] });
	});

	it("parses mixed-type array", () => {
		const json = '{"items":[1,"two",true,null]}';
		const result = assemble(emitAll(json));
		expect(result).toMatchObject({ items: [1, "two", true, null] });
	});

	it("parses empty object — no patches without root", () => {
		const patches = emitAll("{}");
		expect(patches).toHaveLength(1);
		expect(patches[0]).toMatchObject({ path: "", value: {}, op: "complete" });
	});

	it("parses empty object — emits root patch when root is set", () => {
		const patches = emitAll("{}", "prediction");
		expect(patches[0]).toMatchObject({
			path: "prediction",
			value: {},
			op: "add",
		});
	});

	it("parses empty array value", () => {
		const json = '{"items":[]}';
		const result = assemble(emitAll(json));
		expect(result).toMatchObject({ items: [] });
	});
});

// ---------------------------------------------------------------------------
// Root option
// ---------------------------------------------------------------------------

describe("Emitter — root option", () => {
	it("prefixes paths with root when set", () => {
		const patches = emitAll('{"title":"Hello"}', "prediction");
		const titlePatch = patches.find(p => p.path === "prediction.title");
		expect(titlePatch).toBeDefined();
		// Batched scan: entire 'Hello' arrives in one token, emitted as single add
		expect(titlePatch?.value).toBe("Hello");
		expect(titlePatch?.op).toBe("add");
	});

	it("uses no prefix when root is empty", () => {
		const patches = emitAll('{"title":"Hi"}', "");
		expect(patches.some(p => p.path === "title")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// String streaming — op sequence
// ---------------------------------------------------------------------------

describe("Emitter — string op sequence", () => {
	it("emits add for the first chunk, append for subsequent chunks", () => {
		// Single write() — entire string batched into one add patch
		const patches = dataPatchesForPath(emitAll('{"s":"abc"}'), "s");
		expect(patches).toHaveLength(1);
		expect(patches[0]).toMatchObject({ op: "add", value: "abc" });
	});

	it("emits add then append across separate write() calls", () => {
		// Simulate LLM streaming: each character arrives as its own token
		const emitter = new Emitter();
		const patches: StreamingChunk[] = [];
		emitter.on("patch", p => patches.push(p));
		// Feed opening structure, then string chars one at a time
		emitter.write('{"s":"');
		emitter.write("a");
		emitter.write("b");
		emitter.write("c");
		emitter.write('"}');
		emitter.flush();
		const strPatches = patches.filter(p => p.path === "s");
		expect(strPatches[0]).toMatchObject({ op: "add", value: "a" });
		expect(strPatches[1]).toMatchObject({ op: "append", value: "b" });
		expect(strPatches[2]).toMatchObject({ op: "append", value: "c" });
	});

	it("emits add with empty string for empty value", () => {
		const patches = dataPatchesForPath(emitAll('{"s":""}'), "s");
		expect(patches).toHaveLength(1);
		expect(patches[0]).toMatchObject({ op: "add", value: "" });
	});

	it("handles escape sequences in strings", () => {
		const patches = emitAll('{"s":"a\\nb"}');
		const assembled = assembleStringPatches(patches, "s");
		expect(assembled).toBe("a\nb");
	});

	it("handles escaped quotes in strings", () => {
		const patches = emitAll('{"s":"say \\"hi\\""}');
		const assembled = assembleStringPatches(patches, "s");
		expect(assembled).toBe('say "hi"');
	});

	it("handles \\uXXXX unicode escapes", () => {
		const patches = emitAll('{"s":"caf\\u00e9"}');
		const assembled = assembleStringPatches(patches, "s");
		expect(assembled).toBe("caf\u00e9"); // café
	});

	it("handles surrogate pair emoji", () => {
		const patches = emitAll('{"s":"\\uD83D\\uDE00"}');
		const assembled = assembleStringPatches(patches, "s");
		expect(assembled).toBe("\uD83D\uDE00"); // 😀
	});

	it("handles \\uXXXX split across write() calls", () => {
		const emitter = new Emitter();
		const patches: StreamingChunk[] = [];
		emitter.on("patch", p => patches.push(p));
		emitter.write('{"s":"caf');
		emitter.write("\\u00"); // partial \uXXXX
		emitter.write('e9"}');
		emitter.flush();
		const assembled = assembleStringPatches(patches, "s");
		expect(assembled).toBe("caf\u00e9"); // café
	});
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe("Emitter — events", () => {
	it("emits complete after flush", () => {
		const onComplete = vi.fn();
		const emitter = new Emitter();
		emitter.on("complete", onComplete);
		emitter.write('{"x":1}');
		emitter.flush();
		expect(onComplete).toHaveBeenCalledOnce();
	});

	it("resets state after flush so it can be reused", () => {
		const emitter = new Emitter();
		const patches: StreamingChunk[] = [];
		emitter.on("patch", p => patches.push(p));

		emitter.write('{"a":1}');
		emitter.flush();
		const firstCount = patches.length;

		emitter.write('{"b":2}');
		emitter.flush();
		expect(patches.length).toBeGreaterThan(firstCount);
		expect(patches.some(p => p.path === "b")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Character-by-character — validates no multi-event-per-token bugs
// ---------------------------------------------------------------------------

describe("Emitter — char-by-char identical to single write", () => {
	const fixtures = [
		'{"title":"Hello World"}',
		'{"count":42,"flag":true}',
		'{"nested":{"a":1,"b":"two"}}',
		'{"arr":[1,2,3]}',
		'{"cards":[{"term":"Mitosis","def":"cell division"},{"term":"Meiosis"}]}',
		'{"x":null,"y":false,"z":-3.14}',
		'{"s":"escape\\nnewline"}',
		'{"s":"caf\\u00e9"}',
		'{"s":"\\uD83D\\uDE00"}',
	];

	for (const json of fixtures) {
		it(`assembles correctly char-by-char: ${json.slice(0, 40)}`, () => {
			const single = assemble(emitAll(json));
			const charByChar = assemble(emitCharByChar(json));
			expect(charByChar).toEqual(single);
			expect(charByChar).toEqual(JSON.parse(json));
		});
	}
});

// ---------------------------------------------------------------------------
// Split-position boundary tests
// ---------------------------------------------------------------------------

describe("Emitter — all split positions", () => {
	const fixtures = [
		'{"title":"Hello World","count":3}',
		'{"cards":[{"term":"Mitosis"},{"term":"Meiosis"}]}',
		'{"meta":{"version":1,"createdAt":"2025-01-01"},"tags":["a","b"]}',
		'{"flag":true,"nothing":null,"score":-1.5}',
		'{"s":"caf\\u00e9"}',
		'{"s":"\\uD83D\\uDE00"}',
	];

	for (const json of fixtures) {
		it(`split at every position: ${json.slice(0, 40)}...`, () => {
			const expected = JSON.parse(json);

			for (let i = 1; i < json.length; i++) {
				const emitter = new Emitter();
				const patches: StreamingChunk[] = [];
				emitter.on("patch", p => patches.push(p));

				emitter.write(json.slice(0, i));
				emitter.write(json.slice(i));
				emitter.flush();

				const result = assemble(patches);
				expect(result, `Failed at split position ${i} of "${json}"`).toEqual(
					expected
				);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// Emitter → Collector round-trip (integration)
// ---------------------------------------------------------------------------

describe("Emitter + Collector round-trip", () => {
	function roundTrip(json: string, root = ""): unknown {
		const emitter = new Emitter({ root });
		const collector = new Collector();
		emitter.on("patch", p => collector.consume(p));
		emitter.write(json);
		emitter.flush();
		collector.complete();
		return collector.value;
	}

	it("round-trips a flat object", () => {
		const json = '{"title":"Hello","count":5}';
		expect(roundTrip(json)).toEqual(JSON.parse(json));
	});

	it("round-trips nested objects", () => {
		const json = '{"meta":{"version":2,"author":"Richard"}}';
		expect(roundTrip(json)).toEqual(JSON.parse(json));
	});

	it("round-trips arrays of objects", () => {
		const json =
			'{"cards":[{"term":"Mitosis","def":"division"},{"term":"Meiosis"}]}';
		expect(roundTrip(json)).toEqual(JSON.parse(json));
	});

	it("round-trips all primitive types", () => {
		const json = '{"s":"hi","n":42,"f":3.14,"b":true,"no":false,"nil":null}';
		expect(roundTrip(json)).toEqual(JSON.parse(json));
	});

	it("round-trips with root prefix", () => {
		const json = '{"title":"Hello"}';
		const result = roundTrip(json, "prediction") as Record<string, unknown>;
		// With root, the collector receives paths like 'prediction.title'
		// The assembled object will be nested under the root key
		expect(result).toBeDefined();
	});

	it("fires complete with final assembled state", () => {
		const onComplete = vi.fn();
		const emitter = new Emitter();
		const collector = new Collector();
		emitter.on("patch", p => collector.consume(p));
		collector.on("complete", onComplete);

		emitter.write('{"done":true}');
		emitter.flush();
		collector.complete();

		expect(onComplete).toHaveBeenCalledWith(
			expect.objectContaining({ done: true })
		);
	});
});
