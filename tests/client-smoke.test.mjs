/**
 * Client-half smoke test: loads client.js through the module-loader contract,
 * runs apply() against a stub browser context, and checks the slot registration
 * and the Remote call bridge.
 *
 * Run: node tests/client-smoke.test.mjs
 */
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

/** Minimal React surface: the chip is never rendered here, only wired. */
const ReactStub = {
	createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
	useState: (initial) => [initial, () => {}],
	useEffect: () => {},
	useLayoutEffect: () => {},
	useRef: (value) => ({ current: value }),
	useCallback: (fn) => fn
};

let registration;
globalThis.window = {
	__ModuleLoader__: {
		load(value) {
			registration = value;
		}
	}
};
globalThis.document = { getElementById: () => null, createElement: () => ({ setAttribute() {} }), head: { append() {} } };
Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true });

const source = readFileSync(join(here, "..", "client.js"), "utf8");
new Function(source)();
assert.ok(registration !== void 0, "client.js registered a module factory");
assert.equal(registration.id, "@luochbiao/dsh-git-branch-switcher");

const exports = registration.factory((specifier) => {
	if (specifier === "zod") return { z };
	if (specifier === "react") return ReactStub;
	throw new Error(`unexpected require(${specifier})`);
});
assert.equal(typeof exports.apply, "function", "apply exported");
assert.deepEqual(exports.inject, ["remote"], "inject declares the remote service");

let unmounted = false;
let registered;
const statusValue = { repository: true, current: "main", detached: false, branches: [{ name: "main", current: true }], dirtyLines: 0 };
const scope = {
	remote: {
		branchSwitcher: {
			status: async () => ({ ok: true, value: statusValue }),
			fetch: async () => ({ ok: true, value: { repository: true, fetched: true, output: "synced" } })
		}
	},
	slots: {
		inject(slotName, callback) {
			assert.equal(slotName, "conversation.input.left");
			callback();
		},
		register(definition) {
			registered = definition;
			return definition;
		}
	}
};
const ctx = {
	remote: {
		async $mount() {
			return async () => {
				unmounted = true;
			};
		}
	},
	inject(keys, callback) {
		assert.deepEqual(keys, ["remote.branchSwitcher", "slots"]);
		callback(scope);
		return {
			then: (onFulfilled) => Promise.resolve().then(onFulfilled),
			async dispose() {}
		};
	}
};

const dispose = await exports.apply(ctx);
assert.ok(registered !== void 0, "slot registration happened");
assert.equal(registered.id, "git-branch-switcher");
assert.equal(registered.name, "conversation.input.left");
assert.equal(registered.order, 0);

const props = registered.inject("session-42");
assert.equal(props.sessionId, "session-42");
const observed = await props.call("status", { sessionId: "session-42" });
assert.equal(observed.repository, true);
assert.equal(observed.current, "main");

const fetched = await props.call("fetch", { sessionId: "session-42" });
assert.equal(fetched.fetched, true, "fetch call reaches the Remote face");
assert.equal(fetched.output, "synced", "fetch output is returned to the chip");

await dispose();
assert.equal(unmounted, true, "remote unmounted on dispose");
console.log("client smoke test: ok");
