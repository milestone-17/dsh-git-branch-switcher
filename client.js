window.__ModuleLoader__.load({
	id: "@luochbiao/dsh-git-branch-switcher",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const zod = require("zod");
		const React = require("react");
		const h = React.createElement;

		//#region createTypertRemoteInfo — mirrors @deepseek-ai/dsh-typert-protocol (MIT)
		/**
		 * Lazy assembly of generated Remote definitions using caller-supplied Zod; no runtime imports.
		 * @param spec - compiler-produced method facts and Zod factories.
		 * @param zod - the Zod runtime for named-input parsers.
		 * @returns a lazy, mountable info instance with no registration or transport effects.
		 */
		function createTypertRemoteInfo(spec, zod) {
			return new RemoteInfo(spec, zod);
		}
		var RemoteInfo = class {
			spec;
			zod;
			index;
			constructor(spec, zod) {
				this.spec = spec;
				this.zod = zod;
			}
			get package() {
				return this.spec.package;
			}
			get descriptors() {
				return this.resolve().descriptors;
			}
			get methods() {
				return this.resolve().methods;
			}
			resolve() {
				if (this.index !== void 0) return this.index;
				const zod = this.zod;
				const descriptors = [];
				const methods = Object.create(null);
				for (const [endpoint, definition] of Object.entries(this.spec.methods)) {
					const separator = endpoint.indexOf("/");
					const namespace = endpoint.slice(0, separator);
					const method = endpoint.slice(separator + 1);
					const parameters = definition.parameters.map((parameter) => ({
						...parameter,
						wire: parameter.wire ?? parameter.name
					}));
					const descriptor = {
						...definition,
						id: `${this.spec.package}#${endpoint}`,
						namespace,
						method,
						parameters,
						result: definition.result.description === void 0 ? definition.result : new ResultValue(definition.result)
					};
					if (definition.invocation.kind === "direct") {
						const inputs = [];
						methods[endpoint] = Object.assign(descriptor, {
							input(options) {
								const strict = options?.strict === true;
								return inputs[strict ? 1 : 0] ??= new NamedInput(parameters, strict, zod);
							},
							invoke(remote, input, signal) {
								const named = input;
								const values = parameters.map((parameter) => named[parameter.wire]);
								if (definition.cancellation !== void 0) values.push(signal);
								const receiver = Reflect.get(remote, namespace);
								return Reflect.get(receiver, method).apply(receiver, values);
							}
						});
					}
					descriptors.push(descriptor);
				}
				return this.index = { descriptors, methods };
			}
		};
		function optional(parameter) {
			return parameter.source === "json" && parameter.acceptsUndefined === true;
		}
		var NamedInput = class {
			parameters;
			strict;
			zod;
			schema;
			projection;
			constructor(parameters, strict, zod) {
				this.parameters = parameters;
				this.strict = strict;
				this.zod = zod;
			}
			codec(parameter) {
				return this.strict ? parameter.strictCodec : parameter.codec;
			}
			create = () => this.schema ??= this.zod.strictObject(Object.fromEntries(this.parameters.map((parameter) => {
				const value = this.codec(parameter).create();
				return [parameter.wire, optional(parameter) ? value.optional() : value.nonoptional()];
			})));
			get jsonSchema() {
				return this.project().jsonSchema;
			}
			get jsonSchemaError() {
				return this.project().jsonSchemaError;
			}
			project() {
				if (this.projection !== void 0) return this.projection;
				const unavailable = this.parameters.find((parameter) => this.codec(parameter).jsonSchema === void 0);
				if (unavailable !== void 0) return this.projection = { jsonSchemaError: this.codec(unavailable).jsonSchemaError ?? `No JSON Schema for parameter ${unavailable.wire}` };
				return this.projection = { jsonSchema: {
					type: "object",
					properties: Object.fromEntries(this.parameters.map((parameter) => [parameter.wire, {
						...this.codec(parameter).jsonSchema,
						...parameter.description === void 0 ? {} : { description: parameter.description }
					}])),
					required: this.parameters.filter((parameter) => !optional(parameter)).map((parameter) => parameter.wire),
					additionalProperties: false
				} };
			}
		};
		var ResultValue = class {
			spec;
			projection;
			constructor(spec) {
				this.spec = spec;
			}
			get mode() {
				return this.spec.mode;
			}
			get typeSymbol() {
				return this.spec.typeSymbol;
			}
			get create() {
				return this.spec.create;
			}
			get decode() {
				return this.spec.decode;
			}
			get encode() {
				return this.spec.encode;
			}
			get description() {
				return this.spec.description;
			}
			get jsonSchemaError() {
				return this.spec.jsonSchemaError;
			}
			get jsonSchema() {
				if (this.projection === void 0) {
					const schema = this.spec.jsonSchema;
					this.projection = { value: schema === void 0 ? void 0 : {
						...schema,
						description: this.spec.description
					} };
				}
				return this.projection.value;
			}
		};
		//#endregion

		//#region generated Remote schemas
		const $branchRow = () => zod.z.object({
			"name": zod.z.string().describe("Local branch name."),
			"current": zod.z.boolean().describe("Whether HEAD points at this branch.")
		});
		const $remoteBranchRow = () => zod.z.object({
			"name": zod.z.string().describe("Remote-tracking branch name, such as origin/main."),
			"short": zod.z.string().describe("Branch name without the remote prefix."),
			"remote": zod.z.string().describe("Remote name the branch belongs to."),
			"local": zod.z.boolean().describe("Whether a local branch with the same short name exists.")
		});
		const $status_result = () => $status_result$value ??= zod.z.object({
			"repository": zod.z.boolean().describe("Whether the session directory is inside a git work tree."),
			"toplevel": zod.z.string().optional().describe("Repository root when repository is true."),
			"current": zod.z.string().optional().describe("Current branch; omitted on a detached HEAD."),
			"detached": zod.z.boolean().optional().describe("Whether HEAD is detached."),
			"branches": zod.z.array($branchRow()).optional().describe("Local branches, most recent commit first, capped at 500."),
			"remoteBranches": zod.z.array($remoteBranchRow()).optional().describe("Remote-tracking branches, most recent commit first."),
			"dirtyLines": zod.z.number().optional().describe("Uncommitted changes reported by git status --porcelain.")
		});
		let $status_result$value;
		const $checkout_result = () => $checkout_result$value ??= zod.z.union([
			zod.z.object({
				"requireConfirm": zod.z.literal(true),
				"dirtyFiles": zod.z.number(),
				"targetMissing": zod.z.boolean()
			}),
			zod.z.object({
				"repository": zod.z.boolean(),
				"switched": zod.z.literal(true),
				"toplevel": zod.z.string().optional(),
				"current": zod.z.string().optional(),
				"detached": zod.z.boolean().optional(),
				"branches": zod.z.array($branchRow()).optional(),
				"remoteBranches": zod.z.array($remoteBranchRow()).optional(),
				"dirtyLines": zod.z.number().optional()
			})
		]);
		let $checkout_result$value;
		const $fetch_result = () => $fetch_result$value ??= zod.z.object({
			"repository": zod.z.boolean().describe("Whether the session directory is inside a git work tree."),
			"fetched": zod.z.literal(true).describe("Set after a successful git fetch."),
			"output": zod.z.string().optional().describe("Trimmed git fetch output."),
			"toplevel": zod.z.string().optional(),
			"current": zod.z.string().optional(),
			"detached": zod.z.boolean().optional(),
			"branches": zod.z.array($branchRow()).optional(),
			"remoteBranches": zod.z.array($remoteBranchRow()).optional(),
			"dirtyLines": zod.z.number().optional()
		});
		let $fetch_result$value;
		const $status_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation.")
		});
		const $checkout_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation."),
			"branch": zod.z.string().describe("Local branch to switch to."),
			"confirmed": zod.z.boolean().optional().describe("Set after the user confirmed a dirty tree or missing target.")
		});
		const $status_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string()
		});
		const $checkout_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string(),
			"branch": zod.z.string(),
			"confirmed": zod.z.boolean().optional()
		});
		const statusRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StatusRequest",
			create: $status_request,
			jsonSchema: {
				type: "object",
				properties: { sessionId: { type: "string", description: "Session identity of the calling conversation." } },
				required: ["sessionId"],
				additionalProperties: true
			}
		});
		const statusRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StatusRequest",
			create: $status_request_strict,
			jsonSchema: {
				type: "object",
				properties: { sessionId: { type: "string" } },
				required: ["sessionId"],
				additionalProperties: false
			}
		});
		const checkoutRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#CheckoutRequest",
			create: $checkout_request,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string", description: "Session identity of the calling conversation." },
					branch: { type: "string", description: "Local branch to switch to." },
					confirmed: { type: "boolean", description: "Set after the user confirmed a dirty tree or missing target." }
				},
				required: ["sessionId", "branch"],
				additionalProperties: true
			}
		});
		const checkoutRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#CheckoutRequest",
			create: $checkout_request_strict,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string" },
					branch: { type: "string" },
					confirmed: { type: "boolean" }
				},
				required: ["sessionId", "branch"],
				additionalProperties: false
			}
		});
		const TYPERT_REMOTE = createTypertRemoteInfo({
			package: "@luochbiao/dsh-git-branch-switcher",
			methods: {
				"branchSwitcher/status": {
					service: "branchSwitcher",
					description: "Read the repository state around the session's working directory.",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						description: "request object carrying the session identity.",
						source: "json",
						codec: statusRequestCodec(),
						strictCodec: statusRequestStrictCodec()
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchStatus",
						create: $status_result,
						description: "repository presence, current branch, branch rows, and uncommitted-change count.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/checkout": {
					service: "branchSwitcher",
					description: "Switch to one local branch, confirming dirty or missing targets first.",
					invocation: { kind: "direct" },
					parameters: [
						{
							name: "request",
							description: "request object carrying the session identity, the target branch, and the confirmation flag.",
							source: "json",
							codec: checkoutRequestCodec(),
							strictCodec: checkoutRequestStrictCodec()
						}
					],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchCheckout",
						create: $checkout_result,
						description: "a confirmation request, or the repository state after the switch.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/fetch": {
					service: "branchSwitcher",
					description: "Fetch every configured remote so remote-tracking branches catch up.",
					invocation: { kind: "direct" },
					parameters: [
						{
							name: "request",
							description: "request object carrying the session identity.",
							source: "json",
							codec: statusRequestCodec(),
							strictCodec: statusRequestStrictCodec()
						}
					],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchFetch",
						create: $fetch_result,
						description: "the refreshed repository state after a successful git fetch.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				}
			}
		}, zod.z);
		//#endregion

		//#region locale
		const NS = "git-branch-switcher";
		const en = {
			"chip.detached": "detached HEAD",
			"chip.loading": "loading branch…",
			"menu.title": "Switch branch",
			"menu.filter": "Filter branches…",
			"menu.empty": "No local branch found.",
			"menu.current": "current",
			"menu.dirty": "{count} uncommitted change(s)",
			"menu.refresh": "Refresh",
			"menu.fetch": "Fetch remote branches",
			"menu.fetching": "Fetching…",
			"menu.fetched": "Remote branches are up to date.",
			"menu.remoteSection": "Remote branches",
			"menu.remoteTag": "remote",
			"confirm.title": "Confirm switch",
			"confirm.dirty": "The working tree has {count} uncommitted change(s). Switching branches may discard them.",
			"confirm.missing": "Branch \"{branch}\" does not exist locally. Git will create it from the current commit.",
			"confirm.ok": "Switch anyway",
			"confirm.cancel": "Cancel",
			"error.failed": "Branch operation failed: {message}",
			"error.fetch": "Fetch failed: {message}",
			"error.fetchStaleHost": "The running host is an older version without the fetch method. Restart DeepSeek Harness to enable remote syncing."
		};
		const zh = {
			"chip.detached": "游离 HEAD",
			"chip.loading": "正在读取分支…",
			"menu.title": "切换分支",
			"menu.filter": "筛选分支…",
			"menu.empty": "没有找到本地分支。",
			"menu.current": "当前",
			"menu.dirty": "{count} 处未提交改动",
			"menu.refresh": "刷新",
			"menu.fetch": "同步远端分支",
			"menu.fetching": "同步中…",
			"menu.fetched": "远端分支已是最新。",
			"menu.remoteSection": "远端分支",
			"menu.remoteTag": "远端",
			"confirm.title": "确认切换",
			"confirm.dirty": "工作区有 {count} 处未提交改动，切换分支可能会丢失这些改动。",
			"confirm.missing": "本地不存在分支“{branch}”，git 将基于当前提交创建它。",
			"confirm.ok": "仍然切换",
			"confirm.cancel": "取消",
			"error.failed": "分支操作失败：{message}",
			"error.fetch": "同步远端分支失败：{message}",
			"error.fetchStaleHost": "当前运行的宿主版本较旧，还没有同步能力。请完全退出并重启 DeepSeek Harness 应用后再试。"
		};
		const isChinese = () => /^zh\b/i.test(navigator.language ?? "");
		const dictionary = () => isChinese() ? zh : en;
		const t = (key, values) => {
			const template = dictionary()[key] ?? key;
			if (values === void 0) return template;
			return template.replace(/\{(\w+)\}/gu, (whole, name) => String(values[name] ?? whole));
		};
		//#endregion

		//#region styles
		const BASE = "dshgbs";
		const STYLE_ID = "dshgbs-styles";
		const CSS = `
.${BASE}-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#888);font-size:12px;line-height:1;cursor:pointer;max-width:180px}
.${BASE}-chip:hover{background:var(--dsw-alias-background-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333)}
.${BASE}-chip:focus-visible{outline:2px solid var(--dsw-alias-focus-ring,currentColor);outline-offset:1px}
.${BASE}-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${BASE}-icon{flex:0 0 auto}
.${BASE}-chevron{flex:0 0 auto;transition:transform .15s ease}
.${BASE}-menu{position:fixed;z-index:1200;min-width:220px;max-width:320px;padding:6px;border-radius:10px;border:1px solid var(--dsw-alias-border-color,rgba(127,127,127,.25));background:var(--dsw-alias-background-primary,#fff);box-shadow:0 8px 24px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary,#333)}
.${BASE}-title{padding:4px 8px;font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.${BASE}-fetch{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-color,rgba(127,127,127,.25));background:transparent;color:var(--dsw-alias-label-secondary,#888);font-size:11px;line-height:1.2;cursor:pointer;white-space:nowrap}
.${BASE}-fetch:hover:not(:disabled){background:var(--dsw-alias-background-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333)}
.${BASE}-fetch:disabled{opacity:.6;cursor:default}
.${BASE}-section{margin-top:6px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-color,rgba(127,127,127,.18))}
.${BASE}-section-title{padding:2px 8px 4px;font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-notice-line{margin-top:6px;padding:6px 8px;border-radius:6px;background:var(--dsw-alias-background-secondary,transparent);font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-filter{width:100%;box-sizing:border-box;margin:2px 0 6px;padding:5px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-color,rgba(127,127,127,.25));background:var(--dsw-alias-background-secondary,transparent);color:inherit;font-size:12px}
.${BASE}-list{max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:1px}
.${BASE}-row{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;font-size:12px;cursor:pointer;background:transparent;border:none;text-align:left;width:100%;color:inherit}
.${BASE}-row:hover{background:var(--dsw-alias-background-hover,rgba(127,127,127,.12))}
.${BASE}-row[aria-checked="true"]{color:var(--dsw-alias-label-primary,#333);font-weight:600}
.${BASE}-row-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${BASE}-row-tag{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-empty{padding:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-notice{margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--dsw-alias-border-color,rgba(127,127,127,.25));font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#888)}
.${BASE}-notice-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}
.${BASE}-button{padding:4px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-color,rgba(127,127,127,.35));background:transparent;color:inherit;font-size:12px;cursor:pointer}
.${BASE}-button:hover{background:var(--dsw-alias-background-hover,rgba(127,127,127,.12))}
.${BASE}-button-primary{border-color:transparent;background:var(--dsw-alias-accent,currentColor);color:var(--dsw-alias-label-inverse,#fff)}
.${BASE}-error{margin-top:6px;font-size:11px;color:var(--dsw-alias-error,#d33)}
`;
		const insertStyles = () => {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.setAttribute("data-plugin", "@luochbiao/dsh-git-branch-switcher");
			style.textContent = CSS;
			document.head.append(style);
		};
		//#endregion

		//#region icons
		const BranchIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true",
			className: `${BASE}-icon`
		}, h("path", {
			d: "M4.5 2a2 2 0 1 0 .9 3.79A2 2 0 0 0 4.5 2Zm0 4.6v2.8a3.6 3.6 0 0 0 3.6 3.6h.4a2 2 0 1 0 0-1.2h-.4a2.4 2.4 0 0 1-2.4-2.4V6.6a2 2 0 1 0-1.2 0ZM11.5 9.4a2 2 0 1 0 .9.21A2 2 0 0 0 11.5 9.4Z",
			fill: "currentColor"
		}));
		const Chevron = ({ open }) => h("svg", {
			width: 12,
			height: 12,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true",
			className: `${BASE}-chevron`,
			style: open ? { transform: "rotate(180deg)" } : void 0
		}, h("path", {
			d: "M4 6l4 4 4-4",
			stroke: "currentColor",
			"stroke-width": "1.5",
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		}));
		const CheckMark = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", {
			d: "M3 8.5 6.5 12 13 4.5",
			stroke: "currentColor",
			"stroke-width": "1.8",
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		}));
		const SyncIcon = () => h("svg", {
			width: 12,
			height: 12,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", {
			d: "M13.5 8a5.5 5.5 0 1 1-1.7-3.97M13.5 2.5V6H10",
			stroke: "currentColor",
			"stroke-width": "1.5",
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		}));
		//#endregion

		//#region chip
		const SLOT_NAME = "conversation.input.left";
		const SLOT_ID = "git-branch-switcher";

		/** Composer chip: shows the current branch, opens the switcher menu, and mirrors model-selection's popover behavior. */
		function Chip(props) {
			const { sessionId, call } = props;
			const [status, setStatus] = React.useState(void 0);
			const [open, setOpen] = React.useState(false);
			const [busy, setBusy] = React.useState(false);
			const [confirming, setConfirming] = React.useState(void 0);
			const [error, setError] = React.useState(void 0);
			const [notice, setNotice] = React.useState(void 0);
			const [fetching, setFetching] = React.useState(false);
			const [query, setQuery] = React.useState("");
			const [position, setPosition] = React.useState(void 0);
			const rootRef = React.useRef(void 0);
			const triggerRef = React.useRef(void 0);
			const menuRef = React.useRef(void 0);
			const requestIdRef = React.useRef(0);
			const refresh = React.useCallback(async () => {
				const id = ++requestIdRef.current;
				try {
					const next = await call("status", { sessionId });
					if (id === requestIdRef.current) setStatus(next);
				} catch (cause) {
					if (id !== requestIdRef.current) return;
					console.warn("[git-branch-switcher] status failed", cause);
					setStatus(null);
				}
			}, [call, sessionId]);
			React.useEffect(() => {
				refresh();
			}, [refresh]);
			const place = React.useCallback(() => {
				const trigger = triggerRef.current;
				const menu = menuRef.current;
				if (trigger === void 0 || menu === void 0) return;
				const rect = trigger.getBoundingClientRect();
				const width = menu.offsetWidth;
				const height = menu.offsetHeight;
				const MARGIN = 12;
				let left = Math.min(rect.left, window.innerWidth - width - MARGIN);
				left = Math.max(left, MARGIN);
				let top = rect.bottom + 6;
				if (top + height > window.innerHeight - MARGIN) top = Math.max(MARGIN, rect.top - height - 6);
				setPosition({ left, top });
			}, []);
			React.useLayoutEffect(() => {
				if (open) place();
				else setPosition(void 0);
			}, [open, place]);
			React.useEffect(() => {
				if (!open) return;
				const onDown = (event) => {
					if (rootRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				const onKey = (event) => {
					if (event.key === "Escape") {
						setOpen(false);
						triggerRef.current?.focus();
					}
				};
				document.addEventListener("mousedown", onDown);
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("mousedown", onDown);
					document.removeEventListener("keydown", onKey);
				};
			}, [open]);
			if (status === void 0 || status === null || status.repository !== true) return null;
			const detached = status.detached === true || status.current === void 0;
			const label = detached ? t("chip.detached") : status.current;
			const branches = status.branches ?? [];
			const filtered = query === ""
				? branches
				: branches.filter((branch) => branch.name.toLowerCase().includes(query.toLowerCase()));
			const remoteRows = (status.remoteBranches ?? []).filter((ref) => ref.local !== true);
			const filteredRemote = query === ""
				? remoteRows
				: remoteRows.filter((ref) => ref.short.toLowerCase().includes(query.toLowerCase()) || ref.name.toLowerCase().includes(query.toLowerCase()));
			const openMenu = () => {
				setConfirming(void 0);
				setError(void 0);
				setNotice(void 0);
				setQuery("");
				setOpen(true);
				refresh();
			};
			const fetchRemotes = async () => {
				if (busy || fetching) return;
				setFetching(true);
				setError(void 0);
				setNotice(void 0);
				try {
					const result = await call("fetch", { sessionId });
					if (result?.repository === true) setStatus(result);
					setNotice(t("menu.fetched"));
				} catch (cause) {
					const message = String(cause?.message ?? cause);
					setError(/\b404\b/u.test(message) || /not\s+found/iu.test(message)
						? t("error.fetchStaleHost")
						: t("error.fetch", { message }));
				} finally {
					setFetching(false);
				}
			};
			const pick = async (name, confirmed) => {
				if (busy) return;
				setBusy(true);
				setError(void 0);
				try {
					const result = await call("checkout", {
						sessionId,
						branch: name,
						confirmed: confirmed === true
					});
					if (result?.requireConfirm === true) {
						setConfirming({ branch: name, dirtyFiles: result.dirtyFiles, targetMissing: result.targetMissing });
					} else {
						setStatus(result);
						setConfirming(void 0);
						await refresh();
					}
				} catch (cause) {
					setError(t("error.failed", { message: String(cause?.message ?? cause) }));
				} finally {
					setBusy(false);
				}
			};
			const branchRows = filtered.length === 0
				? h("div", { className: `${BASE}-empty` }, t("menu.empty"))
				: filtered.map((branch) => h("button", {
					key: branch.name,
					type: "button",
					className: `${BASE}-row`,
					role: "menuitemradio",
					"aria-checked": branch.current === true,
					disabled: busy,
					onClick: () => pick(branch.name, false)
				}, branch.current === true ? h(CheckMark, null) : h("span", { style: { width: "14px" } }), h("span", { className: `${BASE}-row-name` }, branch.name), branch.current === true ? h("span", { className: `${BASE}-row-tag` }, t("menu.current")) : null));
			const confirmNotice = confirming === void 0 ? null : h("div", { className: `${BASE}-notice` },
				h("div", null, t("confirm.title")),
				confirming.dirtyFiles > 0 ? h("div", { style: { marginTop: "4px" } }, t("confirm.dirty", { count: confirming.dirtyFiles })) : null,
				confirming.targetMissing ? h("div", null, t("confirm.missing", { branch: confirming.branch })) : null,
				h("div", { className: `${BASE}-notice-actions` },
					h("button", {
						type: "button",
						className: `${BASE}-button`,
						onClick: () => setConfirming(void 0)
					}, t("confirm.cancel")),
					h("button", {
						type: "button",
						className: `${BASE}-button ${BASE}-button-primary`,
						disabled: busy,
						onClick: () => pick(confirming.branch, true)
					}, t("confirm.ok"))));
			const remoteBranchRows = filteredRemote.length === 0
				? null
				: h("div", { className: `${BASE}-section` },
					h("div", { className: `${BASE}-section-title` }, t("menu.remoteSection")),
					filteredRemote.map((ref) => h("button", {
						key: ref.name,
						type: "button",
						className: `${BASE}-row`,
						role: "menuitem",
						disabled: busy || fetching,
						onClick: () => pick(ref.name, false)
					}, h("span", { style: { width: "14px" } }), h("span", { className: `${BASE}-row-name` }, ref.short), h("span", { className: `${BASE}-row-tag` }, ref.remote))));
			const errorNotice = error === void 0 ? null : h("div", { className: `${BASE}-error` }, error);
			const noticeLine = notice === void 0 ? null : h("div", { className: `${BASE}-notice-line` }, notice);
			const menu = open ? h("div", {
				className: `${BASE}-menu`,
				ref: menuRef,
				role: "menu",
				style: position === void 0 ? { visibility: "hidden" } : { left: `${position.left}px`, top: `${position.top}px` }
			},
				h("div", { className: `${BASE}-header` },
					h("span", { className: `${BASE}-title` }, t("menu.title")),
					h("button", {
						type: "button",
						className: `${BASE}-fetch`,
						disabled: busy || fetching,
						title: t("menu.fetch"),
						onClick: fetchRemotes
					}, h(SyncIcon, null), h("span", null, fetching ? t("menu.fetching") : t("menu.fetch")))),
				h("input", {
					className: `${BASE}-filter`,
					type: "text",
					value: query,
					placeholder: t("menu.filter"),
					onChange: (event) => setQuery(event.target.value)
				}),
				h("div", { className: `${BASE}-list` }, branchRows, remoteBranchRows),
				noticeLine,
				confirmNotice,
				errorNotice) : null;
			return h("div", { className: `${BASE}-root`, ref: rootRef, style: { display: "inline-flex" } },
				h("button", {
					type: "button",
					className: `${BASE}-chip`,
					ref: triggerRef,
					title: t("menu.title"),
					"aria-haspopup": "menu",
					"aria-expanded": open,
					onClick: () => open ? setOpen(false) : openMenu()
				}, h(BranchIcon, null), h("span", { className: `${BASE}-label` }, label), h(Chevron, { open })),
				menu);
		}
		//#endregion

		//#region plugin
		/** Services the plugin needs before it can mount its Remote and UI. */
		const inject = ["remote"];

		/**
		 * Mount the Remote and register the composer chip.
		 * @param ctx - Browser plugin context.
		 * @returns disposer withdrawing the slot registration and the Remote.
		 */
		async function apply(ctx) {
			insertStyles();
			const unmountRemote = await ctx.remote.$mount(TYPERT_REMOTE);
			const scope = ctx.inject(["remote.branchSwitcher", "slots"], (child) => {
				const invoke = async (method, input) => {
					const result = await child.remote.branchSwitcher[method](input);
					if (result !== null && typeof result === "object" && "ok" in result) {
						if (result.ok !== true) {
							const failure = new Error(String(result.error?.message ?? "branch operation failed"));
							failure.code = result.error?.code;
							throw failure;
						}
						return result.value;
					}
					return result;
				};
				child.slots.inject(SLOT_NAME, () => child.slots.register({
					name: SLOT_NAME,
					id: SLOT_ID,
					order: 0,
					inject: (sessionId) => ({
						sessionId,
						call: invoke
					})
				}, Chip));
			});
			try {
				await scope;
			} catch (cause) {
				await scope.dispose();
				await unmountRemote();
				throw cause;
			}
			return async () => {
				await scope.dispose();
				await unmountRemote();
			};
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
