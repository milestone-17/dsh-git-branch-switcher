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
			fetch: async () => ({ ok: true, value: { repository: true, fetched: true, output: "synced" } }),
			create: async () => ({ ok: true, value: { repository: true, created: true, createdBranch: "feature/demo", current: "feature/demo" } })
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

const created = await props.call("create", { sessionId: "session-42", name: "feature/demo", base: "master" });
assert.equal(created.created, true, "create call reaches the Remote face");
assert.equal(created.createdBranch, "feature/demo", "the new branch name comes back to the chip");
assert.equal(created.current, "feature/demo", "the session sits on the new branch right away");

// --- push/merge bridge: new methods flow through the same Remote face ---
const changesValue = {
	repository: true,
	current: "main",
	files: [{ path: "a.txt", kind: "modified" }, { path: "new.txt", kind: "untracked" }],
	unpushedCount: 2,
	remotes: ["origin"],
	merging: false
};
const pushedValue = { pushed: true, branch: "main", upstream: "origin/main" };
const mergedValue = { merged: true, mode: "fast-forward", restoredTo: "feature/x", branch: "main" };
scope.remote.branchSwitcher.changes = async ({ inferTargetFor }) => ({
	ok: true,
	value: inferTargetFor === void 0 ? changesValue : { ...changesValue, inferredTarget: "main" }
});
scope.remote.branchSwitcher.push = async () => ({ ok: true, value: pushedValue });
scope.remote.branchSwitcher.merge = async () => ({ ok: true, value: mergedValue });
scope.remote.branchSwitcher.mergeAbort = async () => ({ ok: true, value: { repository: true, aborted: true } });

const changes = await props.call("changes", { sessionId: "session-42" });
assert.equal(changes.files.length, 2, "changes rows flow to the chip");
assert.equal(changes.unpushedCount, 2, "unpushed count flows to the chip");
const inferred = await props.call("changes", { sessionId: "session-42", inferTargetFor: "feature/x" });
assert.equal(inferred.inferredTarget, "main", "merge target inference flows to the chip");

const pushResult = await props.call("push", { sessionId: "session-42", files: ["a.txt"], message: "m" });
assert.equal(pushResult.pushed, true, "push call reaches the Remote face");
assert.equal(pushResult.upstream, "origin/main", "the established upstream comes back to the chip");

const mergeResult = await props.call("merge", { sessionId: "session-42", source: "feature/x", target: "main" });
assert.equal(mergeResult.merged, true, "merge call reaches the Remote face");
assert.equal(mergeResult.restoredTo, "feature/x", "the restored branch comes back to the chip");

const abortResult = await props.call("mergeAbort", { sessionId: "session-42" });
assert.equal(abortResult.aborted, true, "mergeAbort call reaches the Remote face");

await dispose();
assert.equal(unmounted, true, "remote unmounted on dispose");
console.log("client smoke test: ok");
