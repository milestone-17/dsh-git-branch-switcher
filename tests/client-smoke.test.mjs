/**
 * Client-half smoke test: loads client.js through the module-loader contract,
 * runs apply() against a stub browser context, and checks the slot registration,
 * the Remote call bridge, and the chip's panel behaviour.
 *
 * Run: node tests/client-smoke.test.mjs
 */
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

/** Compare two hook dependency lists the way React does. */
const sameDeps = (a, b) => {
	if (a === void 0 || b === void 0) return false;
	if (a.length !== b.length) return false;
	return a.every((value, index) => Object.is(value, b[index]));
};

/**
 * The measured geometry of the stub browser: the chip, the composer card it
 * lives in, and the panel it opens. Every rendered node reads these values, so
 * a re-render keeps the same measurements.
 */
const geometry = {
	trigger: { left: 100, top: 700, right: 200, bottom: 726, width: 100, height: 26 },
	card: { left: 0, top: 620, right: 1400, bottom: 760, width: 1400, height: 140 },
	panelWidth: 268,
	panelHeight: 320
};

/**
 * Whether a node contains another node in its subtree.
 * @param {object} node - The subtree root.
 * @param {object} target - The node to look for.
 * @returns True when the target sits inside the subtree.
 */
function containsNode(node, target) {
	if (node === null || node === void 0 || typeof node !== "object") return false;
	if (node === target) return true;
	if (Array.isArray(node)) return node.some((child) => containsNode(child, target));
	return containsNode(node.children, target);
}

/**
 * A hook-aware renderer good enough to drive the chip: hook state survives
 * between passes, a state change re-renders, and the element tree stays
 * inspectable so a test can read it and fire its handlers.
 * @returns The React surface plus the render, flush, and settle helpers.
 */
function createReactSurface() {
	const state = [];
	const callbacks = [];
	const hookDeps = [];
	const cleanups = [];
	let cursor = 0;
	let pending = [];
	let tree = null;
	let dirty = false;

	const React = {
		createElement: (type, props, ...children) => {
			const node = { type, props: props ?? {}, children: children.length === 0 ? null : children };
			const className = typeof node.props.className === "string" ? node.props.className : "";
			const isChip = className.split(/\s+/u).includes("dshgbs-chip");
			const isPanel = className.split(/\s+/u).includes("dshgbs-menu");
			node.getBoundingClientRect = () => {
				if (isChip) return geometry.trigger;
				if (isPanel) {
					return { left: 0, top: 0, right: geometry.panelWidth, bottom: geometry.panelHeight, width: geometry.panelWidth, height: geometry.panelHeight };
				}
				return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
			};
			Object.defineProperty(node, "offsetWidth", { get: () => (isPanel ? geometry.panelWidth : 268), configurable: true });
			Object.defineProperty(node, "offsetHeight", { get: () => (isPanel ? geometry.panelHeight : 320), configurable: true });
			node.closest = (selector) => (isChip && selector === "[data-composer-card]"
				? { getBoundingClientRect: () => geometry.card }
				: null);
			node.contains = (other) => containsNode(node, other);
			node.focus = () => {};
			const ref = node.props.ref;
			if (ref !== void 0 && ref !== null && typeof ref === "object") ref.current = node;
			// Presentational components are expanded right away, the way React
			// would render them, so the tree shows the elements they return.
			if (typeof type === "function") return type({ ...node.props, children: node.children });
			return node;
		},
		Fragment: "fragment",
		useState: (initial) => {
			const index = cursor;
			cursor += 1;
			if (state.length <= index) state[index] = typeof initial === "function" ? initial() : initial;
			const setState = (next) => {
				const value = typeof next === "function" ? next(state[index]) : next;
				if (Object.is(value, state[index])) return;
				state[index] = value;
				dirty = true;
			};
			return [state[index], setState];
		},
		useRef: (value) => {
			const index = cursor;
			cursor += 1;
			if (state.length <= index) state[index] = { current: value };
			return state[index];
		},
		useCallback: (fn, deps) => {
			const index = cursor;
			cursor += 1;
			const previous = callbacks[index];
			if (previous !== void 0 && sameDeps(previous.deps, deps)) return previous.fn;
			callbacks[index] = { fn, deps };
			return fn;
		},
		useEffect: (fn, deps) => {
			const index = cursor;
			cursor += 1;
			pending.push({ fn, deps, index, layout: false });
		},
		useLayoutEffect: (fn, deps) => {
			const index = cursor;
			cursor += 1;
			pending.push({ fn, deps, index, layout: true });
		}
	};

	const render = (Component, props) => {
		cursor = 0;
		pending = [];
		tree = Component(props);
	};

	const flush = () => {
		const effects = pending;
		pending = [];
		for (const effect of effects) {
			const previous = hookDeps[effect.index];
			if (previous !== void 0 && sameDeps(previous, effect.deps)) continue;
			// React runs the previous cleanup before the effect runs again.
			const cleanup = cleanups[effect.index];
			if (typeof cleanup === "function") cleanup();
			cleanups[effect.index] = void 0;
			hookDeps[effect.index] = effect.deps;
			const result = effect.fn();
			if (typeof result === "function") cleanups[effect.index] = result;
		}
	};

	const settle = async () => {
		for (let round = 0; round < 30; round += 1) {
			await new Promise((resolve) => setTimeout(resolve, 0));
			if (!dirty) break;
			dirty = false;
			render(currentComponent, currentProps);
			flush();
		}
	};

	let currentComponent = null;
	let currentProps = null;

	return {
		React,
		/** Mount a component with a clean hook state. */
		mount: (Component, props) => {
			// Unmount the previous instance first, so its listeners and
			// observers do not outlive it.
			for (const cleanup of cleanups) {
				if (typeof cleanup === "function") cleanup();
			}
			state.length = 0;
			callbacks.length = 0;
			hookDeps.length = 0;
			cleanups.length = 0;
			dirty = false;
			currentComponent = Component;
			currentProps = props;
			render(Component, props);
		},
		flush,
		settle,
		tree: () => tree
	};
}

const surface = createReactSurface();
const ReactStub = surface.React;

/** Walk an element tree, visiting every element node. */
function walk(node, visit) {
	if (node === null || node === void 0 || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	if (node.props !== void 0) visit(node);
	walk(node.children, visit);
}

/** Collect the elements whose class list contains the given name. */
function findByClass(tree, className) {
	const hits = [];
	walk(tree, (node) => {
		const value = node.props?.className;
		if (typeof value === "string" && value.split(/\s+/u).includes(className)) hits.push(node);
	});
	return hits;
}

/** The visible text of an element subtree. */
function textOf(node) {
	if (node === null || node === void 0) return "";
	if (typeof node === "string") return node;
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (typeof node === "object" && node.children !== void 0) return textOf(node.children);
	return "";
}

/** Collect the elements whose subtree contains the given text. */
function findByText(tree, text) {
	const hits = [];
	walk(tree, (node) => {
		if (textOf(node).includes(text)) hits.push(node);
	});
	return hits;
}

/** Load the plugin module factory with a caller-supplied require. */
function loadPlugin(requireImpl) {
	let registration;
	globalThis.window.__ModuleLoader__ = {
		load(value) {
			registration = value;
		}
	};
	const source = readFileSync(join(here, "..", "client.js"), "utf8");
	new Function(source)();
	assert.ok(registration !== void 0, "client.js registered a module factory");
	assert.equal(registration.id, "@luochbiao/dsh-git-branch-switcher");
	return registration.factory(requireImpl);
}

/** The browser surface the chip reads while it places its panel. */
const dom = {
	innerHeight: 900,
	innerWidth: 1400,
	listeners: new Map(),
	addEventListener(type, handler) {
		const list = dom.listeners.get(type) ?? [];
		list.push(handler);
		dom.listeners.set(type, list);
	},
	removeEventListener(type, handler) {
		const list = dom.listeners.get(type) ?? [];
		dom.listeners.set(type, list.filter((entry) => entry !== handler));
	},
	dispatch(type, event) {
		for (const handler of dom.listeners.get(type) ?? []) handler(event);
	}
};

globalThis.window = dom;
globalThis.document = {
	getElementById: () => null,
	createElement: () => ({ setAttribute() {} }),
	head: { append() {} },
	body: { nodeName: "BODY" },
	documentElement: { nodeName: "HTML" },
	addEventListener: dom.addEventListener,
	removeEventListener: dom.removeEventListener
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "40px" });
const observers = [];
globalThis.ResizeObserver = class {
	constructor(callback) {
		this.callback = callback;
		this.disconnected = false;
		observers.push(this);
	}
	observe(node) {
		this.node = node;
	}
	unobserve() {}
	disconnect() {
		this.disconnected = true;
	}
};
Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true });

const baseRequire = (specifier) => {
	if (specifier === "zod") return { z };
	if (specifier === "react") return ReactStub;
	throw new Error(`unexpected require(${specifier})`);
};

/** A require that also resolves react-dom, so the portal path can be exercised. */
const portalRequire = (specifier) => {
	if (specifier === "react-dom") {
		return {
			createPortal(node, container) {
				return { type: "portal", props: { children: node, container }, children: [node] };
			}
		};
	}
	return baseRequire(specifier);
};

let registration;
const exports = loadPlugin(baseRequire);
registration = void 0;
assert.equal(typeof exports.apply, "function", "apply exported");
assert.deepEqual(exports.inject, ["remote"], "inject declares the remote service");

let unmounted = false;
let registered;
let chipComponent;
const statusValue = { repository: true, current: "main", detached: false, branches: [{ name: "main", current: true }], dirtyLines: 0 };
const scope = {
	remote: {
		branchSwitcher: {
			status: async () => ({ ok: true, value: statusValue }),
			fetch: async () => ({ ok: true, value: { repository: true, fetched: true, output: "synced" } }),
			create: async () => ({ ok: true, value: { repository: true, created: true, createdBranch: "feature/demo", current: "feature/demo" } }),
			changes: async () => ({ ok: true, value: { repository: true, files: [] } }),
			stash: async () => ({ ok: true, value: { stashed: true, ref: "stash@{0}" } }),
			stashApply: async () => ({ ok: true, value: { applied: true, popped: true } }),
			stashDrop: async () => ({ ok: true, value: { dropped: true } })
		}
	},
	slots: {
		inject(slotName, callback) {
			assert.equal(slotName, "conversation.input.left");
			callback();
		},
		register(definition, component) {
			registered = definition;
			chipComponent = component;
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

const created = await props.call("create", { sessionId: "session-42", name: "feature/demo", base: "main" });
assert.equal(created.created, true, "create call reaches the Remote face");
assert.equal(created.createdBranch, "feature/demo", "the created branch name comes back to the chip");

const listed = await props.call("changes", { sessionId: "session-42" });
assert.equal(Array.isArray(listed.files), true, "changes call reaches the Remote face");

const stashed = await props.call("stash", { sessionId: "session-42", files: ["a.txt"], message: "wip" });
assert.equal(stashed.stashed, true, "stash call reaches the Remote face");
assert.equal(stashed.ref, "stash@{0}", "the stash reference comes back to the chip");
const appliedStash = await props.call("stashApply", { sessionId: "session-42", ref: "stash@{0}", pop: true });
assert.equal(appliedStash.applied, true, "stashApply call reaches the Remote face");
assert.equal(appliedStash.popped, true, "the pop flag flows through");
const dropped = await props.call("stashDrop", { sessionId: "session-42", ref: "stash@{0}" });
assert.equal(dropped.dropped, true, "stashDrop call reaches the Remote face");

await dispose();
assert.equal(unmounted, true, "remote unmounted on dispose");

// ---------------------------------------------------------------------------
// Panel behaviour: the chip is rendered against a stub browser surface.
// ---------------------------------------------------------------------------

/** Build a chip wired to a recording Remote face. */
function mountChip(options = {}) {
	const calls = [];
	const responses = {
		status: async () => ({
			repository: true,
			current: "main",
			detached: false,
			branches: [{ name: "main", current: true }, { name: "feature/x", current: false }],
			remoteBranches: [],
			dirtyLines: 2
		}),
		changes: async (input) => ({
			repository: true,
			current: "main",
			upstream: "origin/main",
			files: [{ path: "a.txt", kind: "modified" }],
			unpushedCount: 1,
			remotes: ["origin"],
			merging: false,
			...(input.inferTargetFor !== void 0 ? { inferredTarget: "feature/x" } : {})
		}),
		push: async () => ({ pushed: true, branch: "main", upstream: "origin/main" }),
		merge: async () => ({ merged: true, mode: "true", restoredTo: "main" }),
		stash: async () => ({ stashed: true, ref: "stash@{0}" }),
		...(options.responses ?? {})
	};
	const call = async (method, input) => {
		calls.push({ method, input });
		if (responses[method] === void 0) throw new Error(`unexpected method ${method}`);
		return responses[method](input ?? {});
	};
	surface.mount(chipComponent, { sessionId: options.sessionId ?? "session-ui", call });
	surface.flush();
	return { calls, call };
}

/** The chip button node of the current tree. */
const chipButton = () => findByClass(surface.tree(), "dshgbs-chip")[0];

/** The panel node of the current tree. */
const panelNode = () => findByClass(surface.tree(), "dshgbs-menu")[0];

// --- the panel is portaled to the document root when the host seeds react-dom ---
{
	const portalExports = loadPlugin(portalRequire);
	let portalTarget = null;
	const portalScope = {
		remote: { branchSwitcher: { status: async () => ({ ok: true, value: statusValue }) } },
		slots: {
			inject(_slotName, callback) {
				callback();
			},
			register(definition, component) {
				chipComponent = component;
				return definition;
			}
		}
	};
	await portalExports.apply({
		remote: { async $mount() { return async () => {}; } },
		inject(_keys, callback) {
			callback(portalScope);
			return { then: (onFulfilled) => Promise.resolve().then(onFulfilled), async dispose() {} };
		}
	});
	const mounted = mountChip();
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();
	const portals = [];
	walk(surface.tree(), (node) => {
		if (node.type === "portal") portals.push(node);
	});
	assert.equal(portals.length, 1, "the panel is portaled to the document root when react-dom is available");
	assert.equal(portals[0].props.container, globalThis.document.body, "the portal lands on the document body");
}

// --- the panel docks above the composer card and never covers it ---
{
	mountChip();
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();

	const style = panelNode().props.style;
	assert.equal(typeof style.maxHeight, "string", "the panel carries an explicit height cap");
	const maxHeight = Number.parseFloat(style.maxHeight);
	const top = Number.parseFloat(style.top);
	assert.equal(maxHeight, 528, "the height cap is the space between the conversation header and the composer");
	assert.ok(top + geometry.panelHeight <= geometry.card.top, "the panel bottom stays above the composer card");
	assert.ok(top >= 84, "the panel top stays below the conversation header");
}

// --- the panel shrinks its content instead of growing past the composer ---
{
	geometry.panelHeight = 900;
	mountChip();
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();

	const style = panelNode().props.style;
	const maxHeight = Number.parseFloat(style.maxHeight);
	const top = Number.parseFloat(style.top);
	assert.equal(maxHeight, 528, "an oversized panel is capped to the available room");
	assert.ok(top + maxHeight <= geometry.card.top, "the capped panel still stops above the composer");
	geometry.panelHeight = 320;
}

// --- the push and merge panels show the direction of the operation ---
{
	mountChip();
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();

	const pushEntry = findByText(surface.tree(), "Push").filter((node) => node.props?.onClick !== void 0).pop();
	assert.ok(pushEntry !== void 0, "the push entry exists in the menu footer");
	pushEntry.props.onClick();
	await surface.settle();

	const flows = findByClass(surface.tree(), "dshgbs-flow");
	assert.ok(flows.length > 0, "the push panel shows a flow strip");
	const flowText = textOf(flows[0]);
	assert.ok(flowText.includes("main"), "the flow strip names the local branch");
	assert.ok(flowText.includes("origin/main"), "the flow strip names the upstream branch");
	assert.ok(findByClass(surface.tree(), "dshgbs-arrow-icon").length > 0, "the flow strip carries a direction arrow");

	const cancel = findByText(surface.tree(), "Cancel").filter((node) => node.props?.onClick !== void 0).pop();
	assert.ok(cancel !== void 0, "the push panel can be left again");
	cancel.props.onClick();
	await surface.settle();

	const mergeEntry = findByText(surface.tree(), "Merge").filter((node) => node.props?.onClick !== void 0).pop();
	assert.ok(mergeEntry !== void 0, "the merge entry exists in the menu footer");
	mergeEntry.props.onClick();
	await surface.settle();

	const mergeFlows = findByClass(surface.tree(), "dshgbs-flow");
	assert.ok(mergeFlows.length > 0, "the merge panel shows a flow strip");
	const mergeText = textOf(mergeFlows[0]);
	assert.ok(mergeText.includes("main"), "the merge flow names the source branch");
	assert.ok(mergeText.includes("feature/x"), "the merge flow names the target branch");
	assert.ok(findByClass(surface.tree(), "dshgbs-flow-arrow").length > 0, "the merge panel shows an arrow between the two selects");
}

// --- the change list is fetched once and shared by the panels ---
{
	const mounted = mountChip({ sessionId: "session-snapshot" });
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();
	const prefetched = mounted.calls.filter((entry) => entry.method === "changes").length;
	assert.equal(prefetched, 1, "opening the menu prefetches the change list once");

	const pushEntry = findByText(surface.tree(), "Push").filter((node) => node.props?.onClick !== void 0).pop();
	pushEntry.props.onClick();
	await surface.settle();
	assert.equal(
		mounted.calls.filter((entry) => entry.method === "changes").length,
		prefetched,
		"the push panel reuses the prefetched snapshot"
	);

	const cancel = findByText(surface.tree(), "Cancel").filter((node) => node.props?.onClick !== void 0).pop();
	cancel.props.onClick();
	await surface.settle();

	const stashEntry = findByText(surface.tree(), "Stash").filter((node) => node.props?.onClick !== void 0).pop();
	assert.ok(stashEntry !== void 0, "the stash entry exists in the menu footer");
	stashEntry.props.onClick();
	await surface.settle();
	assert.equal(
		mounted.calls.filter((entry) => entry.method === "changes").length,
		prefetched,
		"the stash panel reuses the same snapshot"
	);

	const stashCancel = findByText(surface.tree(), "Cancel").filter((node) => node.props?.onClick !== void 0).pop();
	stashCancel.props.onClick();
	await surface.settle();

	const mergeEntry = findByText(surface.tree(), "Merge").filter((node) => node.props?.onClick !== void 0).pop();
	mergeEntry.props.onClick();
	await surface.settle();
	const afterMerge = mounted.calls.filter((entry) => entry.method === "changes");
	assert.equal(afterMerge.length, prefetched + 1, "the merge panel fetches once, for the target inference");
	assert.equal(afterMerge[afterMerge.length - 1].input.inferTargetFor, "main", "the merge fetch asks for the target inference");
}

// --- a push invalidates the snapshot, so the next panel sees fresh data ---
{
	const mounted = mountChip({ sessionId: "session-invalidate" });
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();
	const pushEntry = findByText(surface.tree(), "Push").filter((node) => node.props?.onClick !== void 0).pop();
	pushEntry.props.onClick();
	await surface.settle();
	const before = mounted.calls.filter((entry) => entry.method === "changes").length;

	const submit = findByText(surface.tree(), "Commit & push").filter((node) => node.props?.onClick !== void 0).pop();
	assert.ok(submit !== void 0, "the push panel has its primary action");
	submit.props.onClick();
	await surface.settle();

	const after = mounted.calls.filter((entry) => entry.method === "changes").length;
	assert.ok(after > before, "a push refetches the change list");
}

// --- a prefetch failure never blocks the menu ---
{
	const warnings = [];
	const warn = console.warn;
	console.warn = (...args) => warnings.push(args.join(" "));
	const mounted = mountChip({
		sessionId: "session-failing",
		responses: { changes: async () => { throw new Error("git exploded"); } }
	});
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();
	console.warn = warn;
	assert.ok(panelNode() !== void 0, "the menu opens even when the prefetch fails");
	assert.ok(warnings.some((line) => line.includes("prefetch")), "the prefetch failure is logged, not swallowed silently");
	const pushEntry = findByText(surface.tree(), "Push").filter((node) => node.props?.onClick !== void 0).pop();
	pushEntry.props.onClick();
	await surface.settle();
	const errors = findByClass(surface.tree(), "dshgbs-error");
	assert.ok(errors.length > 0, "the panel reports the failure instead of hanging");
	assert.ok(mounted.calls.some((entry) => entry.method === "changes"), "the failing snapshot was attempted");
}

// --- the panel re-places when its own content grows ---
{
	observers.length = 0;
	mountChip({ sessionId: "session-resize" });
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();
	const before = Number.parseFloat(panelNode().props.style.top);
	assert.ok(observers.length > 0, "the panel is watched by a ResizeObserver");
	const observer = observers[observers.length - 1];
	assert.ok(observer.node !== void 0, "the observer watches the panel node");

	geometry.panelHeight = 500;
	observer.callback([]);
	await surface.settle();
	const after = Number.parseFloat(panelNode().props.style.top);
	assert.ok(after < before, "the panel moves up when its content grows");
	assert.ok(after + geometry.panelHeight <= geometry.card.top, "the grown panel still stops above the composer");
	geometry.panelHeight = 320;

	chipButton().props.onClick();
	await surface.settle();
	assert.equal(observer.disconnected, true, "the observer is released when the panel closes");
}

// --- a click inside the panel keeps it open, a click outside closes it ---
{
	mountChip({ sessionId: "session-dismiss" });
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();
	assert.ok(panelNode() !== void 0, "the menu is open");

	dom.dispatch("mousedown", { target: panelNode() });
	await surface.settle();
	assert.ok(panelNode() !== void 0, "a click inside the portaled panel keeps it open");

	dom.dispatch("mousedown", { target: { nodeName: "DIV" } });
	await surface.settle();
	assert.equal(panelNode(), void 0, "a click outside the panel closes it");
}

// --- the push panel says so when the branch has no upstream ---
{
	mountChip({
		sessionId: "session-no-upstream",
		responses: {
			changes: async () => ({
				repository: true,
				current: "main",
				files: [{ path: "a.txt", kind: "modified" }],
				unpushedCount: 0,
				remotes: ["origin"],
				merging: false
			})
		}
	});
	await surface.settle();
	chipButton().props.onClick();
	await surface.settle();
	const pushEntry = findByText(surface.tree(), "Push").filter((node) => node.props?.onClick !== void 0).pop();
	pushEntry.props.onClick();
	await surface.settle();
	const flows = findByClass(surface.tree(), "dshgbs-flow");
	assert.ok(flows.length > 0, "the push panel still shows a flow strip without an upstream");
	assert.ok(textOf(flows[0]).includes("no upstream"), "the flow strip says the upstream is still open");
}

// --- the shipped locale files match the inline dictionaries ---
{
	const source = readFileSync(join(here, "..", "client.js"), "utf8");
	const grab = (name) => {
		const start = source.indexOf(`const ${name} = {`);
		assert.ok(start > 0, `${name} dictionary found`);
		const open = source.indexOf("{", start);
		let depth = 0;
		let inString = false;
		let quote = "";
		let escaped = false;
		for (let index = open; index < source.length; index += 1) {
			const character = source[index];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (character === "\\") {
				escaped = true;
				continue;
			}
			if (inString) {
				if (character === quote) inString = false;
				continue;
			}
			if (character === '"' || character === "'" || character === "`") {
				inString = true;
				quote = character;
				continue;
			}
			if (character === "{") depth += 1;
			else if (character === "}") {
				depth -= 1;
				if (depth === 0) return new Function(`return (${source.slice(open, index + 1)});`)();
			}
		}
		throw new Error(`${name} dictionary is not terminated`);
	};
	const en = grab("en");
	const zh = grab("zh");
	assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), "the inline dictionaries carry the same keys");
	const enFile = JSON.parse(readFileSync(join(here, "..", "locale", "en.json"), "utf8"));
	const zhFile = JSON.parse(readFileSync(join(here, "..", "locale", "zh.json"), "utf8"));
	assert.deepEqual(Object.keys(enFile).sort(), Object.keys(en).sort(), "locale/en.json matches the inline English dictionary");
	assert.deepEqual(Object.keys(zhFile).sort(), Object.keys(zh).sort(), "locale/zh.json matches the inline Chinese dictionary");
	for (const key of Object.keys(en)) {
		assert.equal(enFile[key], en[key], `locale/en.json carries the English text of ${key}`);
		assert.equal(zhFile[key], zh[key], `locale/zh.json carries the Chinese text of ${key}`);
	}
}

console.log("client smoke test: ok");
