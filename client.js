window.__ModuleLoader__.load({
	id: "@luochbiao/dsh-git-branch-switcher",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const zod = require("zod");
		const React = require("react");
		const h = React.createElement;
		// The host seeds `react-dom` for plugin bundles so a popover can be
		// portaled to the document root, the way the host's own composer menus
		// do. Older hosts do not seed it, so the portal stays optional and the
		// menu falls back to rendering in place.
		const ReactDOM = (() => {
			try {
				return require("react-dom");
			} catch {
				return null;
			}
		})();

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
		const $create_result = () => $create_result$value ??= zod.z.union([
			zod.z.object({
				"requireConfirm": zod.z.literal(true),
				"dirtyFiles": zod.z.number(),
				"targetMissing": zod.z.boolean()
			}),
			zod.z.object({
				"repository": zod.z.boolean(),
				"created": zod.z.literal(true),
				"createdBranch": zod.z.string(),
				"toplevel": zod.z.string().optional(),
				"current": zod.z.string().optional(),
				"detached": zod.z.boolean().optional(),
				"branches": zod.z.array($branchRow()).optional(),
				"remoteBranches": zod.z.array($remoteBranchRow()).optional(),
				"dirtyLines": zod.z.number().optional()
			})
		]);
		let $create_result$value;
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
		const $create_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation."),
			"name": zod.z.string().describe("Name of the branch to create."),
			"base": zod.z.string().describe("Base branch the new branch starts from."),
			"confirmed": zod.z.boolean().optional().describe("Set after the user confirmed a dirty tree.")
		});
		const $create_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string(),
			"name": zod.z.string(),
			"base": zod.z.string(),
			"confirmed": zod.z.boolean().optional()
		});
		const $changes_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation."),
			"inferTargetFor": zod.z.string().optional().describe("Source branch to infer a default merge target for.")
		});
		const $changes_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string(),
			"inferTargetFor": zod.z.string().optional()
		});
		const $push_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation."),
			"files": zod.z.array(zod.z.string()).describe("Checked change paths to stage and commit; empty with pushAll to only push existing commits."),
			"message": zod.z.string().optional().describe("Commit message used when files are staged."),
			"pushAll": zod.z.boolean().optional().describe("Push existing commits without staging anything.")
		});
		const $push_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string(),
			"files": zod.z.array(zod.z.string()),
			"message": zod.z.string().optional(),
			"pushAll": zod.z.boolean().optional()
		});
		const $merge_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation."),
			"source": zod.z.string().describe("Branch to merge from."),
			"target": zod.z.string().describe("Branch to merge into."),
			"confirmed": zod.z.boolean().optional().describe("Set after the user confirmed a dirty tree.")
		});
		const $merge_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string(),
			"source": zod.z.string(),
			"target": zod.z.string(),
			"confirmed": zod.z.boolean().optional()
		});
		const $stash_list_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation.")
		});
		const $stash_list_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string()
		});
		const $stash_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation."),
			"files": zod.z.array(zod.z.string()).describe("Checked change paths to stash; empty with includeUntracked to stash everything."),
			"message": zod.z.string().optional().describe("Optional stash message."),
			"includeUntracked": zod.z.boolean().optional().describe("Also stash untracked files.")
		});
		const $stash_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string(),
			"files": zod.z.array(zod.z.string()),
			"message": zod.z.string().optional(),
			"includeUntracked": zod.z.boolean().optional()
		});
		const $stash_apply_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation."),
			"ref": zod.z.string().describe("Stash reference such as stash@{0}."),
			"pop": zod.z.boolean().optional().describe("Drop the entry after applying it."),
			"confirmed": zod.z.boolean().optional().describe("Set after the user confirmed applying onto a dirty tree.")
		});
		const $stash_apply_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string(),
			"ref": zod.z.string(),
			"pop": zod.z.boolean().optional(),
			"confirmed": zod.z.boolean().optional()
		});
		const $stash_drop_request = () => zod.z.object({
			"sessionId": zod.z.string().describe("Session identity of the calling conversation."),
			"ref": zod.z.string().describe("Stash reference such as stash@{0}."),
			"all": zod.z.boolean().optional().describe("Clear every stash entry instead of one.")
		});
		const $stash_drop_request_strict = () => zod.z.strictObject({
			"sessionId": zod.z.string(),
			"ref": zod.z.string(),
			"all": zod.z.boolean().optional()
		});
		const changesRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#ChangesRequest",
			create: $changes_request,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string", description: "Session identity of the calling conversation." },
					inferTargetFor: { type: "string", description: "Source branch to infer a default merge target for." }
				},
				required: ["sessionId"],
				additionalProperties: true
			}
		});
		const changesRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#ChangesRequest",
			create: $changes_request_strict,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string" },
					inferTargetFor: { type: "string" }
				},
				required: ["sessionId"],
				additionalProperties: false
			}
		});
		const pushRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#PushRequest",
			create: $push_request,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string", description: "Session identity of the calling conversation." },
					files: { type: "array", items: { type: "string" }, description: "Checked change paths to stage and commit; empty with pushAll to only push existing commits." },
					message: { type: "string", description: "Commit message used when files are staged." },
					pushAll: { type: "boolean", description: "Push existing commits without staging anything." }
				},
				required: ["sessionId", "files"],
				additionalProperties: true
			}
		});
		const pushRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#PushRequest",
			create: $push_request_strict,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string" },
					files: { type: "array", items: { type: "string" } },
					message: { type: "string" },
					pushAll: { type: "boolean" }
				},
				required: ["sessionId", "files"],
				additionalProperties: false
			}
		});
		const mergeRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#MergeRequest",
			create: $merge_request,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string", description: "Session identity of the calling conversation." },
					source: { type: "string", description: "Branch to merge from." },
					target: { type: "string", description: "Branch to merge into." },
					confirmed: { type: "boolean", description: "Set after the user confirmed a dirty tree." }
				},
				required: ["sessionId", "source", "target"],
				additionalProperties: true
			}
		});
		const mergeRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#MergeRequest",
			create: $merge_request_strict,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string" },
					source: { type: "string" },
					target: { type: "string" },
					confirmed: { type: "boolean" }
				},
				required: ["sessionId", "source", "target"],
				additionalProperties: false
			}
		});
		const stashListRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StashListRequest",
			create: $stash_list_request,
			jsonSchema: {
				type: "object",
				properties: { sessionId: { type: "string", description: "Session identity of the calling conversation." } },
				required: ["sessionId"],
				additionalProperties: true
			}
		});
		const stashListRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StashListRequest",
			create: $stash_list_request_strict,
			jsonSchema: {
				type: "object",
				properties: { sessionId: { type: "string" } },
				required: ["sessionId"],
				additionalProperties: false
			}
		});
		const stashRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StashRequest",
			create: $stash_request,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string", description: "Session identity of the calling conversation." },
					files: { type: "array", items: { type: "string" }, description: "Checked change paths to stash; empty with includeUntracked to stash everything." },
					message: { type: "string", description: "Optional stash message." },
					includeUntracked: { type: "boolean", description: "Also stash untracked files." }
				},
				required: ["sessionId", "files"],
				additionalProperties: true
			}
		});
		const stashRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StashRequest",
			create: $stash_request_strict,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string" },
					files: { type: "array", items: { type: "string" } },
					message: { type: "string" },
					includeUntracked: { type: "boolean" }
				},
				required: ["sessionId", "files"],
				additionalProperties: false
			}
		});
		const stashApplyRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StashApplyRequest",
			create: $stash_apply_request,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string", description: "Session identity of the calling conversation." },
					ref: { type: "string", description: "Stash reference such as stash@{0}." },
					pop: { type: "boolean", description: "Drop the entry after applying it." },
					confirmed: { type: "boolean", description: "Set after the user confirmed applying onto a dirty tree." }
				},
				required: ["sessionId", "ref"],
				additionalProperties: true
			}
		});
		const stashApplyRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StashApplyRequest",
			create: $stash_apply_request_strict,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string" },
					ref: { type: "string" },
					pop: { type: "boolean" },
					confirmed: { type: "boolean" }
				},
				required: ["sessionId", "ref"],
				additionalProperties: false
			}
		});
		const stashDropRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StashDropRequest",
			create: $stash_drop_request,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string", description: "Session identity of the calling conversation." },
					ref: { type: "string", description: "Stash reference such as stash@{0}." },
					all: { type: "boolean", description: "Clear every stash entry instead of one." }
				},
				required: ["sessionId", "ref"],
				additionalProperties: true
			}
		});
		const stashDropRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#StashDropRequest",
			create: $stash_drop_request_strict,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string" },
					ref: { type: "string" },
					all: { type: "boolean" }
				},
				required: ["sessionId", "ref"],
				additionalProperties: false
			}
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
		const createRequestCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#CreateRequest",
			create: $create_request,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string", description: "Session identity of the calling conversation." },
					name: { type: "string", description: "Name of the branch to create." },
					base: { type: "string", description: "Base branch the new branch starts from." },
					confirmed: { type: "boolean", description: "Set after the user confirmed a dirty tree." }
				},
				required: ["sessionId", "name", "base"],
				additionalProperties: true
			}
		});
		const createRequestStrictCodec = () => ({
			mode: "strict",
			typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#CreateRequest",
			create: $create_request_strict,
			jsonSchema: {
				type: "object",
				properties: {
					sessionId: { type: "string" },
					name: { type: "string" },
					base: { type: "string" },
					confirmed: { type: "boolean" }
				},
				required: ["sessionId", "name", "base"],
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
				},
				"branchSwitcher/create": {
					service: "branchSwitcher",
					description: "Create a branch from a chosen base branch and switch onto it.",
					invocation: { kind: "direct" },
					parameters: [
						{
							name: "request",
							description: "request object carrying the session identity, the new branch name, the base branch, and the confirmation flag.",
							source: "json",
							codec: createRequestCodec(),
							strictCodec: createRequestStrictCodec()
						}
					],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchCreate",
						create: $create_result,
						description: "a confirmation request, or the repository state after the new branch was created and checked out.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/changes": {
					service: "branchSwitcher",
					description: "List the working-tree changes and the unpushed commit count.",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						description: "request object carrying the session identity and an optional branch to infer a merge target for.",
						source: "json",
						codec: changesRequestCodec(),
						strictCodec: changesRequestStrictCodec()
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchChanges",
						create: $status_result,
						description: "typed change rows, the unpushed count, and optionally the inferred merge target.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/push": {
					service: "branchSwitcher",
					description: "Stage the chosen subset of changes, commit them, and push the branch.",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						description: "request object carrying the session identity, checked file paths, commit message, and a push-all flag.",
						source: "json",
						codec: pushRequestCodec(),
						strictCodec: pushRequestStrictCodec()
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchPush",
						create: $status_result,
						description: "the pushed branch, upstream, and trimmed push output.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/merge": {
					service: "branchSwitcher",
					description: "Merge a source branch into a target branch and restore the original branch.",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						description: "request object carrying the session identity, source and target branches, and the confirmation flag.",
						source: "json",
						codec: mergeRequestCodec(),
						strictCodec: mergeRequestStrictCodec()
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchMerge",
						create: $status_result,
						description: "a confirmation request, the merge result, or the conflict listing.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/mergeAbort": {
					service: "branchSwitcher",
					description: "Abort the in-progress merge and restore the pre-merge state.",
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
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchMergeAbort",
						create: $fetch_result,
						description: "the refreshed repository state after the merge was aborted.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/stashList": {
					service: "branchSwitcher",
					description: "List stash entries with the files each one touches.",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						description: "request object carrying the session identity.",
						source: "json",
						codec: stashListRequestCodec(),
						strictCodec: stashListRequestStrictCodec()
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchStashList",
						create: $status_result,
						description: "stash rows with reference, message, branch, file paths, and date.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/stash": {
					service: "branchSwitcher",
					description: "Stash the checked subset of changes into a new stash entry.",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						description: "request object carrying the session identity, checked paths, an optional message, and the untracked flag.",
						source: "json",
						codec: stashRequestCodec(),
						strictCodec: stashRequestStrictCodec()
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchStash",
						create: $status_result,
						description: "the created stash reference, the stashed path count, and the branch.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/stashApply": {
					service: "branchSwitcher",
					description: "Apply one stash entry back onto the working tree, optionally popping it.",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						description: "request object carrying the session identity, the stash reference, and the pop and confirmation flags.",
						source: "json",
						codec: stashApplyRequestCodec(),
						strictCodec: stashApplyRequestStrictCodec()
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchStashApply",
						create: $status_result,
						description: "a confirmation request, the applied reference, or the conflict listing.",
						jsonSchema: { type: "object", additionalProperties: true }
					}
				},
				"branchSwitcher/stashDrop": {
					service: "branchSwitcher",
					description: "Drop one stash entry or clear every entry.",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						description: "request object carrying the session identity, the stash reference, and the all flag.",
						source: "json",
						codec: stashDropRequestCodec(),
						strictCodec: stashDropRequestStrictCodec()
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@luochbiao/dsh-git-branch-switcher/types#BranchStashDrop",
						create: $status_result,
						description: "whether the entry was dropped.",
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
			"menu.filter": "Search branches",
			"menu.empty": "No branch found.",
			"menu.current": "current",
			"menu.dirty": "{count} uncommitted change(s)",
			"menu.refresh": "Refresh",
			"menu.fetch": "Fetch remote branches",
			"menu.fetching": "Fetching…",
			"menu.fetched": "Remote branches are up to date.",
			"menu.remoteSection": "Remote branches",
			"menu.remoteTag": "remote",
			"menu.newBranch": "New branch",
			"menu.createHint": "Create a branch and switch to it right away.",
			"menu.push": "Push",
			"menu.merge": "Merge",
			"menu.diff": "Diff",
			"panel.dock": "Dock to side panel",
			"panel.undock": "Back to popup",
			"create.title": "New branch",
			"create.name": "Branch name",
			"create.namePlaceholder": "feature/my-branch",
			"create.base": "Start from",
			"create.cancel": "Cancel",
			"create.submit": "Create & switch",
			"create.nameRequired": "Enter a branch name first.",
			"push.title": "Push changes",
			"push.hint": "Pick the changes to include, then push them to the remote branch.",
			"push.commitMessage": "Commit message",
			"push.messagePlaceholder": "feat: describe your change",
			"push.all": "Select all",
			"push.none": "Select none",
			"push.checked": "{count} selected",
			"push.submit": "Commit & push",
			"push.clean": "The working tree is clean.",
			"push.loading": "Loading changes…",
			"push.pushCommits": "Push {count} commit(s)",
			"push.done": "Pushed to {upstream}.",
			"push.noRemote": "This repository has no remote. Add one before pushing.",
			"push.noUpstream": "no upstream yet — the first push sets it",
			"push.nothingStaged": "No changes are checked and no commits are waiting to push.",
			"push.staleHost": "The running host is an older version without push support. Restart DeepSeek Harness to enable pushing.",
			"push.summaryChecked": "Commit {count} file(s) to {branch} and push to {upstream}",
			"push.summaryCheckedNewUpstream": "Commit {count} file(s) to {branch}; first push will set upstream {upstream}",
			"push.summaryCommits": "Push {count} commit(s) to {upstream}",
			"push.summaryNoUpstream": "Commit {count} file(s) to local branch {branch} (no upstream yet)",
			"merge.title": "Merge branches",
			"merge.hint": "Merge a source branch into a target branch. You will stay on your current branch afterwards.",
			"merge.source": "Source (merge from)",
			"merge.target": "Target (merge into)",
			"merge.targetDefault": "{branch} (inferred)",
			"merge.targetPending": "pick a target",
			"merge.same": "Source and target must differ.",
			"merge.submit": "Merge",
			"merge.done": "Merged {source} into {target} ({mode}).",
			"merge.upToDate": "{target} is already up to date with {source}.",
			"merge.conflict": "Merge conflicts in {count} file(s). Resolve them, commit, or abort.",
			"merge.abort": "Abort merge",
			"merge.aborted": "Merge aborted; the branch is back to its pre-merge state.",
			"merge.restored": "Back on {branch}.",
			"merge.confirmDirty": "The working tree has {count} uncommitted change(s). Merging may mix them into the target branch.",
			"merge.confirmSummary": "Merge {source} into {target}, then return to {branch}",
			"menu.stash": "Stash",
			"stash.title": "Stash changes",
			"stash.hint": "Pick the changes to set aside, then restore them later from the stash list.",
			"stash.message": "Stash message (optional)",
			"stash.messagePlaceholder": "wip: what you are setting aside",
			"stash.includeUntracked": "Also stash untracked files",
			"stash.submit": "Stash checked",
			"stash.stashAll": "Stash everything",
			"stash.loading": "Loading changes…",
			"stash.done": "Stashed as {ref}.",
			"stash.nothing": "No changes are checked to stash.",
			"stash.clean": "The working tree is clean.",
			"stash.listTitle": "Stash list",
			"stash.listHint": "Restore an entry onto the current branch, or drop it.",
			"stash.empty": "No stash entries yet.",
			"stash.apply": "Apply",
			"stash.pop": "Apply & drop",
			"stash.drop": "Drop",
			"stash.dropAll": "Clear all",
			"stash.applied": "Applied {ref}.",
			"stash.appliedPopped": "Applied and dropped {ref}.",
			"stash.dropped": "Dropped {ref}.",
			"stash.droppedAll": "All stash entries cleared.",
			"stash.confirmDirty": "The working tree has {count} uncommitted change(s). Applying may conflict with them.",
			"stash.files": "{count} file(s)",
			"diff.title": "Diff",
			"diff.hint": "Compare the working tree against HEAD or a recent baseline.",
			"diff.scopeAll": "All changes",
			"diff.scopeRecent": "Recent baseline",
			"diff.loading": "Loading diff…",
			"diff.empty": "No changes to show.",
			"kind.added": "added",
			"kind.modified": "modified",
			"kind.deleted": "deleted",
			"kind.renamed": "renamed",
			"kind.untracked": "untracked",
			"confirm.title": "Confirm switch",
			"confirm.dirty": "The working tree has {count} uncommitted change(s). Switching branches may discard them.",
			"confirm.missing": "Branch \"{branch}\" does not exist locally. Git will create it from the current commit.",
			"confirm.ok": "Switch anyway",
			"confirm.cancel": "Cancel",
			"hint.notGitRepo": "Git Branch Switcher is active. Open a git repository to see your current branch here.",
			"hint.dismiss": "Got it",
			"error.failed": "Branch operation failed: {message}",
			"error.fetch": "Fetch failed: {message}",
			"error.fetchStaleHost": "The running host is an older version without the fetch method. Restart DeepSeek Harness to enable remote syncing."
		};
		const zh = {
			"chip.detached": "游离 HEAD",
			"chip.loading": "正在读取分支…",
			"menu.title": "切换分支",
			"menu.filter": "搜索分支",
			"menu.empty": "没有找到分支。",
			"menu.current": "当前",
			"menu.dirty": "{count} 处未提交改动",
			"menu.refresh": "刷新",
			"menu.fetch": "同步远端分支",
			"menu.fetching": "同步中…",
			"menu.fetched": "远端分支已是最新。",
			"menu.remoteSection": "远端分支",
			"menu.remoteTag": "远端",
			"menu.newBranch": "新建分支",
			"menu.createHint": "创建分支并立即切换过去。",
			"menu.push": "推送",
			"menu.merge": "合并",
			"menu.diff": "查看变更",
			"panel.dock": "停靠到侧栏",
			"panel.undock": "回到弹窗",
			"create.title": "新建分支",
			"create.name": "分支名称",
			"create.namePlaceholder": "feature/my-branch",
			"create.base": "基于",
			"create.cancel": "取消",
			"create.submit": "创建并切换",
			"create.nameRequired": "请先填写分支名称。",
			"push.title": "推送改动",
			"push.hint": "勾选要包含的改动，提交并推送到远端分支。",
			"push.commitMessage": "提交信息",
			"push.messagePlaceholder": "feat: 描述你的改动",
			"push.all": "全选",
			"push.none": "全不选",
			"push.checked": "已选 {count} 项",
			"push.submit": "提交并推送",
			"push.clean": "工作区是干净的。",
			"push.loading": "正在读取改动…",
			"push.pushCommits": "推送 {count} 个提交",
			"push.done": "已推送到 {upstream}。",
			"push.noRemote": "这个仓库还没有配置远端，请先添加远端再推送。",
			"push.noUpstream": "尚无上游，首次推送会自动建立",
			"push.nothingStaged": "没有勾选任何改动，也没有待推送的提交。",
			"push.staleHost": "当前运行的宿主版本较旧，还没有推送能力。请完全退出并重启 DeepSeek Harness 应用后再试。",
			"push.summaryChecked": "将提交 {count} 个文件到 {branch}，并推送到 {upstream}",
			"push.summaryCheckedNewUpstream": "将提交 {count} 个文件到 {branch}，首次推送会自动建立上游 {upstream}",
			"push.summaryCommits": "将推送 {count} 个提交到 {upstream}",
			"push.summaryNoUpstream": "将提交 {count} 个文件到本地分支 {branch}（尚无上游）",
			"merge.title": "合并分支",
			"merge.hint": "把来源分支合并进目标分支，合并后你会回到原来的分支。",
			"merge.source": "来源（从这里合并）",
			"merge.target": "目标（合并到这里）",
			"merge.targetDefault": "{branch}（推断）",
			"merge.targetPending": "请选择目标分支",
			"merge.same": "来源和目标不能是同一个分支。",
			"merge.submit": "合并",
			"merge.done": "已把 {source} 合并进 {target}（{mode}）。",
			"merge.upToDate": "{target} 已包含 {source} 的全部提交，无需合并。",
			"merge.conflict": "{count} 个文件存在合并冲突。解决后提交，或放弃合并。",
			"merge.abort": "放弃合并",
			"merge.aborted": "已放弃合并，分支恢复到合并前的状态。",
			"merge.restored": "已回到 {branch}。",
			"merge.confirmDirty": "工作区有 {count} 处未提交改动，合并可能会把它们混进目标分支。",
			"merge.confirmSummary": "将把 {source} 合并进 {target}，合并后回到 {branch}",
			"menu.stash": "暂存",
			"stash.title": "暂存改动",
			"stash.hint": "勾选要搁置的改动，之后随时可以从暂存列表恢复。",
			"stash.message": "暂存描述（可选）",
			"stash.messagePlaceholder": "wip: 描述你搁置的内容",
			"stash.includeUntracked": "同时暂存未跟踪的文件",
			"stash.submit": "暂存所选",
			"stash.stashAll": "全部暂存",
			"stash.loading": "正在读取改动…",
			"stash.done": "已存入 {ref}。",
			"stash.nothing": "没有勾选任何改动可以暂存。",
			"stash.clean": "工作区是干净的。",
			"stash.listTitle": "暂存列表",
			"stash.listHint": "把某条暂存恢复到当前分支，或者删掉它。",
			"stash.empty": "还没有暂存条目。",
			"stash.apply": "恢复",
			"stash.pop": "恢复并删除",
			"stash.drop": "删除",
			"stash.dropAll": "清空全部",
			"stash.applied": "已恢复 {ref}。",
			"stash.appliedPopped": "已恢复并删除 {ref}。",
			"stash.dropped": "已删除 {ref}。",
			"stash.droppedAll": "已清空全部暂存。",
			"stash.confirmDirty": "工作区有 {count} 处未提交改动，恢复暂存可能与它们冲突。",
			"stash.files": "{count} 个文件",
			"diff.title": "查看变更",
			"diff.hint": "对比工作区与 HEAD，或最近的基线快照。",
			"diff.scopeAll": "全部变更",
			"diff.scopeRecent": "最近基线",
			"diff.loading": "正在加载 diff…",
			"diff.empty": "没有可显示的变更。",
			"kind.added": "新增",
			"kind.modified": "修改",
			"kind.deleted": "删除",
			"kind.renamed": "重命名",
			"kind.untracked": "未跟踪",
			"confirm.title": "确认切换",
			"confirm.dirty": "工作区有 {count} 处未提交改动，切换分支可能会丢失这些改动。",
			"confirm.missing": "本地不存在分支“{branch}”，git 将基于当前提交创建它。",
			"confirm.ok": "仍然切换",
			"confirm.cancel": "取消",
			"hint.notGitRepo": "Git 分支切换器已启用。打开一个 git 仓库后，这里会显示当前分支。",
			"hint.dismiss": "知道了",
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
.${BASE}-root{--${BASE}-r-menu:16px;--${BASE}-r-item:10px;--${BASE}-r-pill:999px;--${BASE}-ease:cubic-bezier(.22,.61,.36,1)}
.${BASE}-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:var(--${BASE}-r-pill);border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#888);font-size:12px;line-height:1;cursor:pointer;max-width:200px;transition:background .12s var(--${BASE}-ease),color .12s var(--${BASE}-ease),box-shadow .12s var(--${BASE}-ease)}
.${BASE}-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333)}
.${BASE}-chip:active{background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.16))}
.${BASE}-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,currentColor);outline-offset:1px}
.${BASE}-chip-hint{opacity:.75;cursor:help}
.${BASE}-chip-hint:hover{opacity:1}
.${BASE}-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11.5px}
/* Mirror the native permission chip: the composer row is a size container, so
   hide the branch text (and the chevron gap) when the row runs out of width. */
@container (width <= 560px){.${BASE}-label{display:none}.${BASE}-chip{padding:0 7px;gap:0}}
@container (width <= 460px){.${BASE}-chip .${BASE}-chevron{display:none}.${BASE}-chip{padding:0 6px}}
.${BASE}-icon{flex:0 0 auto;opacity:.85}
.${BASE}-chevron{flex:0 0 auto;transition:transform .15s var(--${BASE}-ease);opacity:.7}
.${BASE}-menu{position:fixed;z-index:1200;width:268px;max-height:calc(100vh - 24px);overflow-y:auto;overscroll-behavior:contain;padding:8px;border-radius:var(--${BASE}-r-menu);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 1px 2px rgba(0,0,0,.05),0 6px 16px rgba(0,0,0,.1),0 16px 40px rgba(0,0,0,.14);color:var(--dsw-alias-label-primary,#333);font-size:13px;line-height:1.4;user-select:none;transform-origin:top left;animation:${BASE}-in .14s var(--${BASE}-ease)}
@keyframes ${BASE}-in{from{opacity:0;transform:translateY(4px) scale(.985)}to{opacity:1;transform:none}}
.${BASE}-menu::-webkit-scrollbar{width:6px;height:6px}
.${BASE}-menu::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(127,127,127,.28)}
.${BASE}-menu::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.45)}
.${BASE}-menu::-webkit-scrollbar-track{background:transparent}
.${BASE}-search{display:flex;align-items:center;gap:6px;padding:2px 2px 6px}
.${BASE}-search-icon{flex:0 0 auto;color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-filter{flex:1 1 auto;min-width:0;box-sizing:border-box;padding:6px 10px;border:none;border-radius:var(--${BASE}-r-item);outline:none;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.07));color:inherit;font-size:13px;transition:background .12s var(--${BASE}-ease),box-shadow .12s var(--${BASE}-ease)}
.${BASE}-filter::placeholder{color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-filter:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.${BASE}-filter:focus{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.11));box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6feb) 30%,transparent)}
.${BASE}-icon-button{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:var(--${BASE}-r-pill);background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;transition:background .12s var(--${BASE}-ease),color .12s var(--${BASE}-ease)}
.${BASE}-icon-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333)}
.${BASE}-icon-button:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.16))}
.${BASE}-icon-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,currentColor);outline-offset:1px}
.${BASE}-icon-button:disabled{opacity:.55;cursor:default}
.${BASE}-icon-button[data-busy="true"] svg{animation:${BASE}-spin .9s linear infinite}
@keyframes ${BASE}-spin{to{transform:rotate(360deg)}}
.${BASE}-list{max-height:264px;overflow:auto;display:flex;flex-direction:column;gap:1px;margin:0;padding:0;list-style:none;scrollbar-width:thin;scrollbar-color:rgba(127,127,127,.3) transparent}
.${BASE}-list::-webkit-scrollbar{width:6px}
.${BASE}-list::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(127,127,127,.28)}
.${BASE}-list::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.45)}
.${BASE}-row{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:7px 9px;border:none;border-radius:var(--${BASE}-r-item);background:transparent;color:inherit;font-size:13px;text-align:left;cursor:pointer;transition:background .12s var(--${BASE}-ease),color .12s var(--${BASE}-ease)}
.${BASE}-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.${BASE}-row:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.13))}
.${BASE}-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,currentColor);outline-offset:-1px}
.${BASE}-row:disabled{opacity:.5;cursor:default}
.${BASE}-row[aria-checked="true"]{background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.13));color:var(--dsw-alias-brand-primary,#2f6feb);font-weight:500}
.${BASE}-row-mark{flex:0 0 auto;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center}
.${BASE}-row-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12.5px}
.${BASE}-row-tag{flex:0 0 auto;padding:1px 7px;border-radius:var(--${BASE}-r-pill);background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:1.5}
.${BASE}-section{margin-top:5px;padding-top:5px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.13))}
.${BASE}-section-title{padding:3px 9px 4px;color:var(--dsw-alias-label-tertiary,#999);font-size:11px;letter-spacing:.02em}
.${BASE}-empty{padding:10px 9px;color:var(--dsw-alias-label-tertiary,#999);font-size:12.5px}
.${BASE}-footer{margin-top:5px;padding-top:5px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.13));display:flex;align-items:center;gap:2px}
.${BASE}-row-new{flex:1 1 0;color:var(--dsw-alias-label-secondary,#888)}
.${BASE}-row-new:hover:not(:disabled){color:var(--dsw-alias-brand-primary,#2f6feb)}
.${BASE}-panel{display:flex;flex-direction:column;gap:10px;padding:10px 8px 6px;animation:${BASE}-panel-in .12s var(--${BASE}-ease)}
@keyframes ${BASE}-panel-in{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}
.${BASE}-panel-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#333)}
.${BASE}-panel-hint{margin-top:-6px;color:var(--dsw-alias-label-tertiary,#999);font-size:11.5px}
.${BASE}-panel-summary{margin-top:-2px;padding:5px 8px;border-radius:var(--${BASE}-r-item);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));color:var(--dsw-alias-label-secondary,#888);font-size:11.5px;line-height:1.4}
.${BASE}-flow{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--${BASE}-r-item);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));color:var(--dsw-alias-label-secondary,#888);font-size:11.5px;line-height:1.4;overflow:hidden}
.${BASE}-flow-end{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}
.${BASE}-flow-arrow-icon,.${BASE}-arrow{flex:0 0 auto;color:var(--dsw-alias-brand-primary,#2f6feb)}
.${BASE}-flow-note{margin-left:auto;flex:0 0 auto;color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-flow-pending .${BASE}-flow-end{color:var(--dsw-alias-label-tertiary,#999)}
.${BASE}-flow-arrow{display:flex;justify-content:center;margin:-4px 0;color:var(--dsw-alias-brand-primary,#2f6feb)}
.${BASE}-field{display:flex;flex-direction:column;gap:5px}
.${BASE}-field-label{color:var(--dsw-alias-label-tertiary,#999);font-size:11.5px}
.${BASE}-input,.${BASE}-select{box-sizing:border-box;width:100%;padding:7px 10px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));border-radius:var(--${BASE}-r-item);outline:none;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.05));color:inherit;font-size:13px;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);transition:border-color .12s var(--${BASE}-ease),background .12s var(--${BASE}-ease),box-shadow .12s var(--${BASE}-ease)}
.${BASE}-input:hover,.${BASE}-select:hover{border-color:var(--dsw-alias-border-l1,rgba(127,127,127,.3))}
.${BASE}-input:focus,.${BASE}-select:focus{border-color:var(--dsw-alias-brand-primary,#2f6feb);background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.09));box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6feb) 22%,transparent)}
.${BASE}-panel-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}
.${BASE}-button{padding:6px 14px;border-radius:var(--${BASE}-r-item);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));background:var(--dsw-alias-button-elevated-fill,transparent);color:var(--dsw-alias-label-primary,#333);font-size:12.5px;cursor:pointer;transition:background .12s var(--${BASE}-ease),transform .1s var(--${BASE}-ease),box-shadow .12s var(--${BASE}-ease)}
.${BASE}-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.${BASE}-button:active:not(:disabled){transform:scale(.97)}
.${BASE}-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,currentColor);outline-offset:1px}
.${BASE}-button:disabled{opacity:.5;cursor:default}
.${BASE}-button-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,#2f6feb);color:var(--dsw-alias-label-primary-foreground,#fff)}
.${BASE}-button-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#2560d0)}
.${BASE}-checkline{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:var(--${BASE}-r-item);cursor:pointer;transition:background .12s var(--${BASE}-ease)}
.${BASE}-checkline:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.09))}
.${BASE}-checkline input[type="checkbox"]{appearance:none;-webkit-appearance:none;flex:0 0 auto;width:15px;height:15px;margin:0;border:1.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));border-radius:5px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .12s var(--${BASE}-ease),border-color .12s var(--${BASE}-ease)}
.${BASE}-checkline input[type="checkbox"]:hover{border-color:var(--dsw-alias-brand-primary,#2f6feb)}
.${BASE}-checkline input[type="checkbox"]:checked{background:var(--dsw-alias-brand-primary,#2f6feb);border-color:var(--dsw-alias-brand-primary,#2f6feb)}
.${BASE}-checkline input[type="checkbox"]:checked::after{content:"";width:8px;height:8px;background:no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 8.5 6.5 12 13 4.5' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}
.${BASE}-checkline input[type="checkbox"]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,currentColor);outline-offset:1px}
.${BASE}-check-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px;direction:rtl;text-align:left}
.${BASE}-check-kind{flex:0 0 auto;padding:1px 7px;border-radius:var(--${BASE}-r-pill);background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:1.5}
.${BASE}-file-list{max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:1px;margin:0 -2px;padding:0 2px;scrollbar-width:thin;scrollbar-color:rgba(127,127,127,.3) transparent}
.${BASE}-file-list::-webkit-scrollbar{width:6px}
.${BASE}-file-list::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(127,127,127,.28)}
.${BASE}-file-list::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.45)}
.${BASE}-list-tools{display:flex;align-items:center;justify-content:space-between;gap:8px}
.${BASE}-link{border:none;background:none;padding:2px 4px;border-radius:6px;color:var(--dsw-alias-brand-primary,#2f6feb);font-size:11.5px;cursor:pointer;transition:background .12s var(--${BASE}-ease)}
.${BASE}-link:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.${BASE}-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,currentColor)}
.${BASE}-counter{color:var(--dsw-alias-label-tertiary,#999);font-size:11.5px}
.${BASE}-notice{margin-top:6px;padding:10px 11px;border-radius:var(--${BASE}-r-item);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.05));color:var(--dsw-alias-label-secondary,#888);font-size:12px;line-height:1.6;animation:${BASE}-panel-in .12s var(--${BASE}-ease)}
.${BASE}-notice-title{color:var(--dsw-alias-label-primary,#333);font-weight:600;font-size:12.5px}
.${BASE}-notice-summary{margin-top:4px;color:var(--dsw-alias-label-secondary,#888);font-size:11.5px;line-height:1.5}
.${BASE}-notice-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.${BASE}-stash-item{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));border-radius:var(--${BASE}-r-item);padding:8px 9px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.04));animation:${BASE}-panel-in .12s var(--${BASE}-ease)}
.${BASE}-stash-top{display:flex;align-items:center;gap:6px;min-width:0}
.${BASE}-stash-msg{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:var(--dsw-alias-label-primary,#333)}
.${BASE}-stash-branch{flex:0 0 auto;padding:1px 7px;border-radius:var(--${BASE}-r-pill);background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:1.5;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}
.${BASE}-stash-files{margin-top:3px;color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:1.5}
.${BASE}-stash-actions{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
.${BASE}-notice-line{margin-top:6px;padding:7px 10px;border-radius:var(--${BASE}-r-item);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));color:var(--dsw-alias-label-tertiary,#999);font-size:11.5px;animation:${BASE}-panel-in .12s var(--${BASE}-ease)}
.${BASE}-error{margin-top:6px;color:var(--dsw-alias-state-error-primary,#d33);font-size:11.5px;line-height:1.5;animation:${BASE}-panel-in .12s var(--${BASE}-ease)}
.${BASE}-menu-panel{position:fixed;right:12px;top:84px;width:380px;max-height:calc(100vh - 108px);box-shadow:0 12px 40px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.08)}
.${BASE}-diff-scope{margin-bottom:4px}
.${BASE}-diff-layout{display:flex;gap:10px;max-height:420px;overflow:hidden}
.${BASE}-diff-files{flex:0 0 140px;display:flex;flex-direction:column;gap:1px;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.13));padding-right:6px}
.${BASE}-diff-body{flex:1 1 auto;overflow:auto;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.04));border-radius:var(--${BASE}-r-item);padding:8px}
.${BASE}-diff-hunk{margin:0;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-secondary,#888)}
.${BASE}-file-row{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:var(--${BASE}-r-item);cursor:pointer;transition:background .12s var(--${BASE}-ease)}
.${BASE}-file-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.${BASE}-file-row-selected{background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.13))}
.${BASE}-file-kind{flex:0 0 auto;width:18px;text-align:center;padding:1px 0;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase}
.${BASE}-file-kind-added{background:#d1fae5;color:#065f46}
.${BASE}-file-kind-modified{background:#dbeafe;color:#1e40af}
.${BASE}-file-kind-deleted{background:#fee2e2;color:#991b1b}
.${BASE}-file-kind-renamed{background:#fef3c7;color:#92400e}
.${BASE}-file-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11.5px}
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
			width: 14,
			height: 14,
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
		const SearchIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", {
			d: "M11.2 10.2 14 13M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z",
			stroke: "currentColor",
			"stroke-width": "1.4",
			"stroke-linecap": "round"
		}));
		const PlusIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", {
			d: "M8 3.5v9M3.5 8h9",
			stroke: "currentColor",
			"stroke-width": "1.5",
			"stroke-linecap": "round"
		}));
		const PushIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", {
			d: "M8 13V3M4.5 6.5 8 3l3.5 3.5",
			stroke: "currentColor",
			"stroke-width": "1.5",
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		}));
		const MergeIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", {
			d: "M4.5 2.5v4a3 3 0 0 0 1.2 2.4l3 2.2a3 3 0 0 1 1.2 2.4v0M11.5 2.5v1.9a3 3 0 0 1-1.2 2.4l-1.9 1.4",
			stroke: "currentColor",
			"stroke-width": "1.4",
			"stroke-linecap": "round"
		}), h("circle", {
			cx: 4.5,
			cy: 14,
			r: 1.4,
			fill: "currentColor"
		}));
		const StashIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", {
			d: "M2.5 4.5h11M2.5 8h11M2.5 11.5h6",
			stroke: "currentColor",
			"stroke-width": "1.4",
			"stroke-linecap": "round"
		}), h("path", {
			d: "M11 13.5l1.8-1.8M11 13.5l1.8 1.2",
			stroke: "currentColor",
			"stroke-width": "1.4",
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		}));
		/** Direction arrow: rightwards for a source → target flow, downwards inside a stacked form. */
		const ArrowIcon = ({ down = false }) => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true",
			className: `${BASE}-arrow ${BASE}-arrow-icon`
		}, h("path", {
			d: down === true ? "M8 3v10M4 9l4 4 4-4" : "M3 8h10M9 4l4 4-4 4",
			stroke: "currentColor",
			"stroke-width": "1.5",
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		}));
		const PanelIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", { d: "M1 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3Zm5 0v10", stroke: "currentColor", "stroke-width": "1.5" }));
		const PopupIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		}, h("path", { d: "M3 5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5Zm7-3v3", stroke: "currentColor", "stroke-width": "1.5" }));
		const DiffIcon = () => h("svg", {
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			"aria-hidden": "true"
		},
			h("path", { d: "M4 3v10M2 5l2-2 2 2", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }),
			h("path", { d: "M12 3v10M10 11l2 2 2-2", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }));
		/**
		 * A "source → target" strip naming the direction of the operation.
		 * @param props - The `from` and `to` branch names plus an optional trailing note.
		 * @returns The flow strip element.
		 */
		const FlowRow = ({ from, to, note }) => h("div", { className: `${BASE}-flow` },
			h("span", { className: `${BASE}-flow-end`, title: from }, from),
			h(ArrowIcon, { down: false }),
			h("span", { className: `${BASE}-flow-end`, title: to }, to),
			note !== void 0 ? h("span", { className: `${BASE}-flow-note` }, note) : null);
		//#endregion

		//#region chip
		const SLOT_NAME = "conversation.input.left";
		const SLOT_ID = "git-branch-switcher";
		/** Last known status per session, kept across slot remounts so switching conversations renders instantly. */
		const statusMemory = new Map();
		/**
		 * Last known working-tree snapshot per session. The push, stash, and
		 * merge panels read the same snapshot, so switching between them never
		 * fetches the change list twice.
		 */
		const changesCache = new Map();
		/** How long a snapshot stays usable before it is fetched again. */
		const CHANGES_CACHE_MS = 30000;

		/**
		 * Space the host reserves above the conversation: the frame's top
		 * clearance plus a little air. The host publishes the clearance as a CSS
		 * variable and reads it the same way for its own composer menus, so the
		 * panel stops below the conversation header instead of sliding under it.
		 * @returns The reserved height in pixels.
		 */
		const frameTopReserve = () => {
			if (typeof document === "undefined" || typeof getComputedStyle !== "function") return 84;
			const raw = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dsh-frame-top-clearance"));
			const clearance = Number.isNaN(raw) ? 84 : raw;
			return Math.max(84, clearance + 20);
		};

		/** Composer chip: shows the current branch, opens the switcher menu, and mirrors model-selection's popover behavior. */
		function Chip(props) {
			const { sessionId, call } = props;
			const [status, setStatus] = React.useState(() => statusMemory.get(sessionId));
			const [open, setOpen] = React.useState(false);
			const [busy, setBusy] = React.useState(false);
			const [confirming, setConfirming] = React.useState(void 0);
			const [error, setError] = React.useState(void 0);
			const [notice, setNotice] = React.useState(void 0);
			const [fetching, setFetching] = React.useState(false);
			const [query, setQuery] = React.useState("");
			const [position, setPosition] = React.useState(void 0);
			const [mode, setMode] = React.useState("list");
			const [newName, setNewName] = React.useState("");
			const [baseBranch, setBaseBranch] = React.useState("");
			const [changes, setChanges] = React.useState(void 0);
			const [checked, setChecked] = React.useState({});
			const [pushMessage, setPushMessage] = React.useState("");
			const [mergeSource, setMergeSource] = React.useState("");
			const [mergeTarget, setMergeTarget] = React.useState("");
			const [mergeInferred, setMergeInferred] = React.useState(false);
			const [mergeState, setMergeState] = React.useState(void 0);
			const [stashFiles, setStashFiles] = React.useState(void 0);
			const [stashChecked, setStashChecked] = React.useState({});
			const [stashMessage, setStashMessage] = React.useState("");
			const [stashUntracked, setStashUntracked] = React.useState(false);
			const [stashRows, setStashRows] = React.useState(void 0);
			const [stashMode, setStashMode] = React.useState("save");
			const [diffScope, setDiffScope] = React.useState("all");
			const [diffFiles, setDiffFiles] = React.useState(void 0);
			const [diffPatch, setDiffPatch] = React.useState("");
			const [diffSelected, setDiffSelected] = React.useState(void 0);
			const [snapshots, setSnapshots] = React.useState([]);
			const [hintDismissed, setHintDismissed] = React.useState(() => {
				try {
					return localStorage.getItem("dsh-gbs-hint") === "1";
				} catch {
					return true;
				}
			});
			const dismissHint = React.useCallback(() => {
				setHintDismissed(true);
				try {
					localStorage.setItem("dsh-gbs-hint", "1");
				} catch {}
			}, []);
			const [panelMode, setPanelMode] = React.useState(() => {
				try {
					return localStorage.getItem("dsh-gbs-panel-mode") === "1";
				} catch {
					return false;
				}
			});
			const togglePanelMode = React.useCallback(() => {
				setPanelMode((prev) => {
					const next = !prev;
					try {
						localStorage.setItem("dsh-gbs-panel-mode", next ? "1" : "0");
					} catch {}
					return next;
				});
			}, []);
			const rootRef = React.useRef(void 0);
			const triggerRef = React.useRef(void 0);
			const menuRef = React.useRef(void 0);
			const requestIdRef = React.useRef(0);
			const refresh = React.useCallback(async () => {
				const id = ++requestIdRef.current;
				try {
					const next = await call("status", { sessionId });
					if (id === requestIdRef.current) {
						statusMemory.set(sessionId, next);
						setStatus(next);
					}
				} catch (cause) {
					if (id !== requestIdRef.current) return;
					console.warn("[git-branch-switcher] status failed", cause);
					setStatus(null);
				}
			}, [call, sessionId]);
			React.useEffect(() => {
				refresh();
			}, [refresh]);
			/**
			 * Read the working-tree snapshot, reusing the cached one so the
			 * push, stash, and merge panels never fetch the same list twice.
			 * @param options - Optional `inferTargetFor` branch whose merge target should be inferred.
			 * @returns The change snapshot.
			 */
			const readChanges = React.useCallback(async (options = {}) => {
				const inferTargetFor = typeof options.inferTargetFor === "string" && options.inferTargetFor.length > 0
					? options.inferTargetFor
					: void 0;
				const cached = changesCache.get(sessionId);
				const fresh = cached !== void 0 && Date.now() - cached.at < CHANGES_CACHE_MS;
				if (fresh && (inferTargetFor === void 0 || cached.inferredFor === inferTargetFor)) {
					return cached.value;
				}
				const result = await call("changes", inferTargetFor === void 0 ? { sessionId } : { sessionId, inferTargetFor });
				changesCache.set(sessionId, { at: Date.now(), value: result, inferredFor: inferTargetFor });
				return result;
			}, [call, sessionId]);
			/**
			 * Capture a working-tree snapshot for this session and keep the
			 * local list in sync with the Host's rolling history.
			 */
			const recordSnapshot = React.useCallback(async (label) => {
				try {
					const shot = await call("snapshot", { sessionId, label });
					setSnapshots((prev) => {
						const next = [...prev, { id: shot.snapshotId, at: shot.at, label }];
						return next.slice(-8);
					});
					return shot.snapshotId;
				} catch (cause) {
					console.warn("[git-branch-switcher] snapshot failed", cause);
					return void 0;
				}
			}, [call, sessionId]);
			/**
			 * Load a diff for the selected scope. "all" compares HEAD to the
			 * current working tree; a snapshot id compares that baseline to now.
			 */
			const loadDiff = React.useCallback(async (scope) => {
				setDiffFiles(void 0);
				setDiffPatch("");
				setDiffSelected(void 0);
				try {
					const from = scope === "all" ? "HEAD" : scope;
					const current = scope === "all" ? "HEAD" : await recordSnapshot("diff current");
					if (current === void 0) return;
					const result = await call("diff", { sessionId, from, to: current });
					setDiffFiles(result.files);
					setDiffPatch(result.patch);
					if (result.files.length > 0) setDiffSelected(result.files[0].path);
				} catch (cause) {
					console.warn("[git-branch-switcher] diff failed", cause);
					setDiffFiles([]);
				}
			}, [call, sessionId, recordSnapshot]);
			/**
			 * Fetch the change snapshot in the background while the menu is
			 * open, so the push and stash panels show their list right away.
			 */
			const prefetchChanges = React.useCallback(() => {
				readChanges().catch((cause) => {
					// The panel that needs the data reports the failure itself.
					console.warn("[git-branch-switcher] changes prefetch failed", cause);
				});
			}, [readChanges]);
			const place = React.useCallback(() => {
				const trigger = triggerRef.current;
				const menu = menuRef.current;
				if (trigger === void 0 || menu === void 0) return;
				const rect = trigger.getBoundingClientRect();
				const MARGIN = 12;
				const GAP = 8;
				// Anchor on the composer card: the host's own composer menus use
				// the same attribute, so the panel clears the input area instead
				// of covering the draft and the send button.
				const card = typeof trigger.closest === "function" ? trigger.closest("[data-composer-card]") : null;
				const anchorTop = card !== null ? card.getBoundingClientRect().top : rect.top;
				const width = menu.offsetWidth;
				// The panel docks above the composer, so the room it may use is
				// the space between the conversation header and the composer.
				const reserve = frameTopReserve();
				const ceiling = anchorTop - GAP;
				const maxHeight = Math.min(Math.max(ceiling - reserve, 160), window.innerHeight - MARGIN * 2);
				const height = Math.min(menu.offsetHeight, maxHeight);
				let left = Math.min(rect.left, window.innerWidth - width - MARGIN);
				left = Math.max(left, MARGIN);
				let top = ceiling - height;
				top = Math.max(reserve, Math.min(top, window.innerHeight - height - MARGIN));
				setPosition((current) => {
					if (current !== void 0 && current.left === left && current.top === top && current.maxHeight === maxHeight) return current;
					return { left, top, maxHeight };
				});
			}, []);
			React.useLayoutEffect(() => {
				if (!open) {
					setPosition(void 0);
					return;
				}
				place();
				// The panel grows when its data arrives, so it re-places on its own
				// size change and whenever the page or the window moves.
				const onViewportChange = () => place();
				window.addEventListener("scroll", onViewportChange, true);
				window.addEventListener("resize", onViewportChange);
				const menu = menuRef.current;
				const observer = typeof ResizeObserver !== "undefined" && menu !== null ? new ResizeObserver(() => place()) : null;
				if (menu !== null) observer?.observe(menu);
				return () => {
					observer?.disconnect();
					window.removeEventListener("scroll", onViewportChange, true);
					window.removeEventListener("resize", onViewportChange);
				};
			}, [open, mode, place]);
			React.useEffect(() => {
				if (!open) return;
				const onDown = (event) => {
					if (rootRef.current?.contains(event.target) === true) return;
					// The panel may be portaled to the document root, so it is
					// not a descendant of the chip anymore.
					if (menuRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				const onKey = (event) => {
					if (event.key === "Escape") {
						if (mode === "create" || mode === "push" || mode === "merge" || mode === "stash") {
							setMode("list");
							setError(void 0);
							return;
						}
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
			}, [open, mode]);
			if (status === void 0 || status === null || status.repository !== true) {
				if (status !== void 0 && status !== null && status.repository === false && !hintDismissed) {
					return h("button", {
						type: "button",
						className: `${BASE}-chip ${BASE}-chip-hint`,
						title: t("hint.notGitRepo"),
						"aria-label": t("hint.notGitRepo"),
						onClick: dismissHint
					}, h(BranchIcon, null), h("span", { className: `${BASE}-label` }, "Git"));
				}
				return null;
			}
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
			const baseOptions = [
				...branches.map((branch) => ({ value: branch.name, label: branch.name })),
				...remoteRows.map((ref) => ({ value: ref.name, label: ref.name }))
			];
			const preferredBase = () => {
				const names = new Set(branches.map((branch) => branch.name));
				if (names.has("main")) return "main";
				if (names.has("master")) return "master";
				if (status.current !== void 0 && names.has(status.current)) return status.current;
				return branches[0]?.name ?? "";
			};
			const openMenu = () => {
				setConfirming(void 0);
				setError(void 0);
				setNotice(void 0);
				setQuery("");
				setMode("list");
				setNewName("");
				setBaseBranch(preferredBase());
				setChanges(void 0);
				setChecked({});
				setPushMessage("");
				setMergeState(void 0);
				setOpen(true);
				refresh();
				// Warm the change snapshot so the push and stash panels open on
				// their list instead of a loading state.
				prefetchChanges();
			};
			const openCreate = () => {
				setConfirming(void 0);
				setError(void 0);
				setNotice(void 0);
				setMode("create");
				setNewName("");
				setBaseBranch((current) => current === "" ? preferredBase() : current);
			};
			/**
			 * Adopt a change snapshot: the shared state plus a fully checked
			 * selection for the push panel.
			 * @param result - The snapshot returned by the host.
			 */
			const applySnapshot = (result) => {
				setChanges(result);
				const nextChecked = {};
				for (const row of result.files ?? []) nextChecked[row.path] = true;
				setChecked(nextChecked);
			};
			const loadChanges = async () => {
				setError(void 0);
				setNotice(void 0);
				setMode("push");
				try {
					applySnapshot(await readChanges());
				} catch (cause) {
					const message = String(cause?.message ?? cause);
					setChanges({ repository: true, files: [], unpushedCount: 0, remotes: [] });
					setError(/\b404\b/u.test(message) || /not\s+found/iu.test(message)
						? t("push.staleHost")
						: t("error.failed", { message }));
				}
			};
			const loadMerge = async () => {
				setError(void 0);
				setNotice(void 0);
				setMode("merge");
				setMergeState(void 0);
				const source = status.current ?? branches[0]?.name ?? "";
				setMergeSource(source);
				setMergeTarget("");
				setMergeInferred(false);
				try {
					// One call covers both the change list and the inferred
					// merge target, so the panel never waits for two round trips.
					const result = await readChanges(source === "" ? {} : { inferTargetFor: source });
					applySnapshot(result);
					if (result.merging === true) {
						setMergeState({ conflicted: true, files: result.conflictFiles ?? [], branch: status.current ?? "" });
						return;
					}
					const inferred = result.inferredTarget;
					if (typeof inferred === "string" && inferred !== source) {
						setMergeTarget(inferred);
						setMergeInferred(true);
					}
				} catch (cause) {
					const message = String(cause?.message ?? cause);
					setError(/\b404\b/u.test(message) || /not\s+found/iu.test(message)
						? t("push.staleHost")
						: t("error.failed", { message }));
				}
			};
			const loadStashSave = async () => {
				setError(void 0);
				setNotice(void 0);
				setMode("stash");
				setStashMode("save");
				setStashMessage("");
				setStashRows(void 0);
				try {
					// The same snapshot the push panel uses: no second fetch.
					const result = await readChanges();
					setChanges(result);
					const nextChecked = {};
					for (const row of result.files ?? []) nextChecked[row.path] = true;
					setStashChecked(nextChecked);
					setStashFiles(result.files ?? []);
				} catch (cause) {
					const message = String(cause?.message ?? cause);
					setStashFiles([]);
					setError(/\b404\b/u.test(message) || /not\s+found/iu.test(message)
						? t("push.staleHost")
						: t("error.failed", { message }));
				}
			};
			const loadStashList = async () => {
				setError(void 0);
				setNotice(void 0);
				setMode("stash");
				setStashMode("list");
				setStashFiles(void 0);
				try {
					const result = await call("stashList", { sessionId });
					setStashRows(result.stashes ?? []);
				} catch (cause) {
					const message = String(cause?.message ?? cause);
					setStashRows([]);
					setError(/\b404\b/u.test(message) || /not\s+found/iu.test(message)
						? t("push.staleHost")
						: t("error.failed", { message }));
				}
			};
			const doStash = async (all) => {
				if (busy) return;
				const files = all === true
					? (stashFiles ?? []).map((row) => row.path)
					: Object.keys(stashChecked).filter((path) => stashChecked[path] === true);
				if (files.length === 0 && all !== true) {
					setError(t("stash.nothing"));
					return;
				}
				setBusy(true);
				setError(void 0);
				try {
					const result = await call("stash", {
						sessionId,
						files,
						...(stashMessage.trim().length > 0 ? { message: stashMessage.trim() } : {}),
						includeUntracked: stashUntracked === true || all === true
					});
					setNotice(t("stash.done", { ref: result.ref ?? "stash@{0}" }));
					setStashMessage("");
					setStashChecked({});
					setStashFiles([]);
					changesCache.delete(sessionId);
					await refresh();
					recordSnapshot("after stash");
				} catch (cause) {
					const message = String(cause?.message ?? cause);
					if (cause?.code === "branchSwitcher/nothing-stashed") setError(t("stash.nothing"));
					else setError(t("error.failed", { message }));
				} finally {
					setBusy(false);
				}
			};
			const doStashApply = async (ref, pop, confirmed) => {
				if (busy) return;
				setBusy(true);
				setError(void 0);
				try {
					const result = await call("stashApply", { sessionId, ref, pop: pop === true, confirmed: confirmed === true });
					if (result?.requireConfirm === true) {
						setConfirming({ action: "stashApply", ref, pop: pop === true, dirtyFiles: result.dirtyFiles });
					} else if (result?.conflicted === true) {
						setError(t("merge.conflict", { count: (result.files ?? []).length }));
					} else {
						setNotice(pop === true ? t("stash.appliedPopped", { ref }) : t("stash.applied", { ref }));
						changesCache.delete(sessionId);
						await refresh();
						recordSnapshot("after stash apply");
					}
				} catch (cause) {
					setError(t("error.failed", { message: String(cause?.message ?? cause) }));
				} finally {
					setBusy(false);
				}
			};
			const doStashDrop = async (ref, all) => {
				if (busy) return;
				setBusy(true);
				setError(void 0);
				try {
					await call("stashDrop", { sessionId, ref, all: all === true });
					setNotice(all === true ? t("stash.droppedAll") : t("stash.dropped", { ref }));
					const listed = await call("stashList", { sessionId });
					setStashRows(listed.stashes ?? []);
				} catch (cause) {
					setError(t("error.failed", { message: String(cause?.message ?? cause) }));
				} finally {
					setBusy(false);
				}
			};
			const doPush = async (pushAll) => {
				if (busy) return;
				setBusy(true);
				setError(void 0);
				try {
					const files = Object.keys(checked).filter((path) => checked[path] === true);
					const result = await call("push", {
						sessionId,
						files,
						message: pushMessage,
						pushAll: pushAll === true
					});
					setNotice(t("push.done", { upstream: result.upstream ?? result.branch }));
					setPushMessage("");
					// The tree changed, so the shared snapshot is stale.
					changesCache.delete(sessionId);
					applySnapshot(await readChanges());
					recordSnapshot("after push");
				} catch (cause) {
					const message = String(cause?.message ?? cause);
					if (cause?.code === "branchSwitcher/no-remote") setError(t("push.noRemote"));
					else if (cause?.code === "branchSwitcher/nothing-staged") setError(t("push.nothingStaged"));
					else setError(t("error.failed", { message }));
				} finally {
					setBusy(false);
				}
			};
			const doMerge = async (confirmed) => {
				if (busy) return;
				const source = mergeSource;
				const target = mergeTarget;
				if (source === "" || target === "") return;
				if (source === target) {
					setError(t("merge.same"));
					return;
				}
				setBusy(true);
				setError(void 0);
				try {
					const result = await call("merge", {
						sessionId,
						source,
						target,
						confirmed: confirmed === true
					});
					if (result?.requireConfirm === true) {
						setConfirming({ action: "merge", source, target, dirtyFiles: result.dirtyFiles });
					} else if (result?.conflicted === true) {
						setMergeState({ conflicted: true, files: result.files ?? [], branch: result.branch ?? target });
						changesCache.delete(sessionId);
						await refresh();
					} else if (result?.merged === true) {
						if (result.mode === "up-to-date") {
							setNotice(t("merge.upToDate", { source, target }));
						} else {
							setNotice(t("merge.done", { source, target, mode: result.mode }) + (result.restoredTo !== void 0 ? " " + t("merge.restored", { branch: result.restoredTo }) : ""));
						}
						setMergeState(void 0);
						setMode("list");
						changesCache.delete(sessionId);
						await refresh();
						recordSnapshot("after merge");
					}
				} catch (cause) {
					setError(t("error.failed", { message: String(cause?.message ?? cause) }));
				} finally {
					setBusy(false);
				}
			};
			const doMergeAbort = async () => {
				if (busy) return;
				setBusy(true);
				setError(void 0);
				try {
					await call("mergeAbort", { sessionId });
					setNotice(t("merge.aborted"));
					setMergeState(void 0);
					setMode("list");
					changesCache.delete(sessionId);
					await refresh();
					recordSnapshot("after merge abort");
				} catch (cause) {
					setError(t("error.failed", { message: String(cause?.message ?? cause) }));
				} finally {
					setBusy(false);
				}
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
						setConfirming({ action: "switch", branch: name, dirtyFiles: result.dirtyFiles, targetMissing: result.targetMissing });
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
			const createBranch = async (confirmed) => {
				if (busy) return;
				const name = newName.trim();
				if (name.length === 0) {
					setError(t("create.nameRequired"));
					return;
				}
				const base = baseBranch === "" ? preferredBase() : baseBranch;
				setBusy(true);
				setError(void 0);
				try {
					const result = await call("create", {
						sessionId,
						name,
						base,
						confirmed: confirmed === true
					});
					if (result?.requireConfirm === true) {
						setConfirming({ action: "create", branch: name, base, dirtyFiles: result.dirtyFiles, targetMissing: false });
					} else {
						setStatus(result);
						setConfirming(void 0);
						setMode("list");
						setNewName("");
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
				}, h("span", { className: `${BASE}-row-mark` }, branch.current === true ? h(CheckMark, null) : null), h("span", { className: `${BASE}-row-name` }, branch.name)));
			const confirmNotice = confirming === void 0 ? null : h("div", { className: `${BASE}-notice` },
				h("div", { className: `${BASE}-notice-title` }, confirming.action === "merge" ? t("merge.title") : confirming.action === "stashApply" ? t("stash.listTitle") : t("confirm.title")),
				confirming.action === "merge" && confirming.source !== "" && confirming.target !== ""
					? h("div", { className: `${BASE}-notice-summary` }, t("merge.confirmSummary", { source: confirming.source, target: confirming.target, branch: status.current ?? "" }))
					: null,
				confirming.dirtyFiles > 0 ? h("div", { style: { marginTop: "4px" } }, confirming.action === "merge"
					? t("merge.confirmDirty", { count: confirming.dirtyFiles })
					: confirming.action === "stashApply"
						? t("stash.confirmDirty", { count: confirming.dirtyFiles })
						: t("confirm.dirty", { count: confirming.dirtyFiles })) : null,
				confirming.targetMissing === true ? h("div", null, t("confirm.missing", { branch: confirming.branch })) : null,
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
						onClick: () => {
							if (confirming.action === "create") createBranch(true);
							else if (confirming.action === "merge") doMerge(true);
							else if (confirming.action === "stashApply") doStashApply(confirming.ref, confirming.pop, true);
							else pick(confirming.branch, true);
						}
					}, confirming.action === "merge" ? t("merge.submit") : t("confirm.ok"))));
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
					}, h("span", { className: `${BASE}-row-mark` }), h("span", { className: `${BASE}-row-name` }, ref.short), h("span", { className: `${BASE}-row-tag` }, ref.remote))));
			const errorNotice = error === void 0 ? null : h("div", { className: `${BASE}-error` }, error);
			const noticeLine = notice === void 0 ? null : h("div", { className: `${BASE}-notice-line` }, notice);
			const listPanel = h(React.Fragment, null,
				h("div", { className: `${BASE}-search` },
					h("span", { className: `${BASE}-search-icon` }, h(SearchIcon, null)),
					h("input", {
						className: `${BASE}-filter`,
						type: "text",
						value: query,
						placeholder: t("menu.filter"),
						onChange: (event) => setQuery(event.target.value)
					}),
					h("button", {
						type: "button",
						className: `${BASE}-icon-button`,
						disabled: busy || fetching,
						"data-busy": fetching ? "true" : "false",
						title: fetching ? t("menu.fetching") : t("menu.fetch"),
						"aria-label": fetching ? t("menu.fetching") : t("menu.fetch"),
						onClick: fetchRemotes
					}, h(SyncIcon, null)),
					h("button", {
						type: "button",
						className: `${BASE}-icon-button`,
						title: panelMode ? t("panel.undock") : t("panel.dock"),
						"aria-label": panelMode ? t("panel.undock") : t("panel.dock"),
						onClick: togglePanelMode
					}, panelMode ? h(PopupIcon, null) : h(PanelIcon, null))),
				h("div", { className: `${BASE}-list` }, branchRows, remoteBranchRows),
				h("div", { className: `${BASE}-footer` },
					h("button", {
						type: "button",
						className: `${BASE}-row ${BASE}-row-new`,
						role: "menuitem",
						disabled: busy,
						onClick: openCreate
					}, h("span", { className: `${BASE}-row-mark` }, h(PlusIcon, null)), h("span", { className: `${BASE}-row-name` }, t("menu.newBranch"))),
					h("button", {
						type: "button",
						className: `${BASE}-row ${BASE}-row-new`,
						role: "menuitem",
						disabled: busy,
						onClick: loadChanges
					}, h("span", { className: `${BASE}-row-mark` }, h(PushIcon, null)), h("span", { className: `${BASE}-row-name` }, t("menu.push"))),
					h("button", {
						type: "button",
						className: `${BASE}-row ${BASE}-row-new`,
						role: "menuitem",
						disabled: busy || branches.length < 2,
						onClick: loadMerge
					}, h("span", { className: `${BASE}-row-mark` }, h(MergeIcon, null)), h("span", { className: `${BASE}-row-name` }, t("menu.merge"))),
					h("button", {
						type: "button",
						className: `${BASE}-row ${BASE}-row-new`,
						role: "menuitem",
						disabled: busy,
						onClick: loadStashSave
					}, h("span", { className: `${BASE}-row-mark` }, h(StashIcon, null)), h("span", { className: `${BASE}-row-name` }, t("menu.stash"))),
					h("button", {
						type: "button",
						className: `${BASE}-row ${BASE}-row-new`,
						role: "menuitem",
						disabled: busy,
						onClick: loadStashList
					}, h("span", { className: `${BASE}-row-mark` }, h(StashIcon, null)), h("span", { className: `${BASE}-row-name` }, t("stash.listTitle"))),
					h("button", {
						type: "button",
						className: `${BASE}-row ${BASE}-row-new`,
						role: "menuitem",
						disabled: busy,
						onClick: () => { setMode("diff"); loadDiff("all"); recordSnapshot("diff baseline"); }
					}, h("span", { className: `${BASE}-row-mark` }, h(DiffIcon, null)), h("span", { className: `${BASE}-row-name` }, t("menu.diff")))));
			const createPanel = h("div", { className: `${BASE}-panel` },
				h("div", { className: `${BASE}-panel-title` }, t("create.title")),
				h("div", { className: `${BASE}-panel-hint` }, t("menu.createHint")),
				h("label", { className: `${BASE}-field` },
					h("span", { className: `${BASE}-field-label` }, t("create.name")),
					h("input", {
						className: `${BASE}-input`,
						type: "text",
						value: newName,
						placeholder: t("create.namePlaceholder"),
						autoFocus: true,
						onChange: (event) => setNewName(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								createBranch(false);
							}
						}
					})),
				h("label", { className: `${BASE}-field` },
					h("span", { className: `${BASE}-field-label` }, t("create.base")),
					h("select", {
						className: `${BASE}-select`,
						value: baseBranch === "" ? preferredBase() : baseBranch,
						onChange: (event) => setBaseBranch(event.target.value)
					}, baseOptions.map((option) => h("option", { key: option.value, value: option.value }, option.label)))),
				h("div", { className: `${BASE}-panel-actions` },
					h("button", {
						type: "button",
						className: `${BASE}-button`,
						onClick: () => setMode("list")
					}, t("create.cancel")),
					h("button", {
						type: "button",
						className: `${BASE}-button ${BASE}-button-primary`,
						disabled: busy || newName.trim().length === 0,
						onClick: () => createBranch(false)
					}, t("create.submit"))));
			const changeRows = (changes?.files ?? []).map((row) => h("label", {
				key: row.path,
				className: `${BASE}-checkline`
			},
				h("input", {
					type: "checkbox",
					checked: checked[row.path] === true,
					onChange: (event) => setChecked((current) => ({ ...current, [row.path]: event.target.checked }))
				}),
				h("span", { className: `${BASE}-check-path`, title: row.previousPath !== void 0 ? `${row.previousPath} → ${row.path}` : row.path }, row.path),
				h("span", { className: `${BASE}-check-kind` }, t(`kind.${row.kind}`))));
			const checkedCount = Object.values(checked).filter((value) => value === true).length;
			const localOptions = branches.map((branch) => ({ value: branch.name, label: branch.name }));
			const pushRemotes = changes?.remotes ?? [];
			const pushUpstream = changes?.upstream;
			// The push direction: the local branch and the remote branch it goes to.
			const pushFlow = changes === void 0 || pushRemotes.length === 0
				? null
				: pushUpstream !== void 0 && pushUpstream !== ""
					? h(FlowRow, { from: changes.current ?? "", to: pushUpstream })
					: h("div", { className: `${BASE}-flow ${BASE}-flow-pending` },
						h("span", { className: `${BASE}-flow-end` }, changes.current ?? ""),
						h(ArrowIcon, { down: false }),
						h("span", { className: `${BASE}-flow-note` }, t("push.noUpstream")));
			const pushSummary = changes === void 0 || pushRemotes.length === 0
				? null
				: checkedCount > 0
					? pushUpstream !== void 0 && pushUpstream !== ""
						? h("div", { className: `${BASE}-panel-summary` }, t("push.summaryChecked", { count: checkedCount, branch: changes.current ?? "", upstream: pushUpstream }))
						: h("div", { className: `${BASE}-panel-summary` }, t("push.summaryNoUpstream", { count: checkedCount, branch: changes.current ?? "" }))
					: (changes?.unpushedCount ?? 0) > 0 && pushUpstream !== void 0 && pushUpstream !== ""
						? h("div", { className: `${BASE}-panel-summary` }, t("push.summaryCommits", { count: changes.unpushedCount, upstream: pushUpstream }))
						: null;
			const pushPanel = h("div", { className: `${BASE}-panel` },
				h("div", { className: `${BASE}-panel-title` }, t("push.title")),
				h("div", { className: `${BASE}-panel-hint` }, t("push.hint")),
				pushFlow,
				pushSummary,
				changes === void 0
					? h("div", { className: `${BASE}-empty` }, t("push.loading"))
					: (changes?.remotes ?? []).length === 0
						? h("div", { className: `${BASE}-empty` }, t("push.noRemote"))
						: (changes?.files ?? []).length === 0
							? h("div", { className: `${BASE}-empty` }, t("push.clean"))
							: h(React.Fragment, null,
							h("div", { className: `${BASE}-list-tools` },
								h("span", { className: `${BASE}-counter` }, t("push.checked", { count: checkedCount })),
								h("span", { style: { display: "flex", gap: "4px" } },
									h("button", {
										type: "button",
										className: `${BASE}-link`,
										onClick: () => setChecked((current) => Object.fromEntries(Object.keys(current).map((path) => [path, true])))
									}, t("push.all")),
									h("button", {
										type: "button",
										className: `${BASE}-link`,
										onClick: () => setChecked((current) => Object.fromEntries(Object.keys(current).map((path) => [path, false])))
									}, t("push.none")))),
							h("div", { className: `${BASE}-file-list` }, changeRows),
							h("label", { className: `${BASE}-field` },
								h("span", { className: `${BASE}-field-label` }, t("push.commitMessage")),
								h("input", {
									className: `${BASE}-input`,
									type: "text",
									value: pushMessage,
									placeholder: t("push.messagePlaceholder"),
									onChange: (event) => setPushMessage(event.target.value)
								}))),
				h("div", { className: `${BASE}-panel-actions` },
					h("button", {
						type: "button",
						className: `${BASE}-button`,
						onClick: () => setMode("list")
					}, t("create.cancel")),
					h("button", {
						type: "button",
						className: `${BASE}-button ${BASE}-button-primary`,
						disabled: busy || changes === void 0 || (changes?.remotes ?? []).length === 0 || (checkedCount === 0 && (changes?.unpushedCount ?? 0) === 0) || (checkedCount > 0 && pushMessage.trim().length === 0),
						onClick: () => doPush(false)
					}, checkedCount === 0 && (changes?.unpushedCount ?? 0) > 0
						? t("push.pushCommits", { count: changes.unpushedCount })
						: t("push.submit"))));
			const mergeConflict = mergeState?.conflicted === true ? h("div", { className: `${BASE}-notice` },
				h("div", { className: `${BASE}-notice-title` }, t("merge.conflict", { count: mergeState.files.length })),
				h("div", { className: `${BASE}-file-list`, style: { marginTop: "6px" } }, mergeState.files.map((path) => h("div", {
					key: path,
					className: `${BASE}-checkline`,
					style: { cursor: "default" }
				}, h("span", { className: `${BASE}-check-path` }, path)))),
				h("div", { className: `${BASE}-notice-actions` },
					h("button", {
						type: "button",
						className: `${BASE}-button`,
						disabled: busy,
						onClick: doMergeAbort
					}, t("merge.abort")))) : null;
			const mergePanel = h("div", { className: `${BASE}-panel` },
				h("div", { className: `${BASE}-panel-title` }, t("merge.title")),
				h("div", { className: `${BASE}-panel-hint` }, t("merge.hint")),
				mergeConflict,
				mergeState?.conflicted === true ? null : h(React.Fragment, null,
					mergeSource !== "" ? h(FlowRow, {
						from: mergeSource,
						to: mergeTarget === "" ? t("merge.targetPending") : mergeTarget,
						note: mergeSource !== "" && mergeTarget !== "" && mergeSource === mergeTarget ? t("merge.same") : void 0
					}) : null,
					h("label", { className: `${BASE}-field` },
						h("span", { className: `${BASE}-field-label` }, t("merge.source")),
						h("select", {
							className: `${BASE}-select`,
							value: mergeSource,
							onChange: (event) => {
								setMergeSource(event.target.value);
								setMergeTarget((current) => current === event.target.value ? "" : current);
							}
						}, localOptions.map((option) => h("option", { key: option.value, value: option.value }, option.label)))),
					h("div", { className: `${BASE}-flow-arrow`, "aria-hidden": "true" }, h(ArrowIcon, { down: true })),
					h("label", { className: `${BASE}-field` },
						h("span", { className: `${BASE}-field-label` }, mergeTarget !== "" && mergeInferred
							? t("merge.targetDefault", { branch: mergeTarget })
							: t("merge.target")),
						h("select", {
							className: `${BASE}-select`,
							value: mergeTarget,
							onChange: (event) => {
								setMergeTarget(event.target.value);
								setMergeInferred(false);
							}
						}, localOptions.filter((option) => option.value !== mergeSource).map((option) => h("option", {
							key: option.value,
							value: option.value
						}, option.label)))),
					mergeSource !== "" && mergeTarget !== "" && mergeSource === mergeTarget ? h("div", { className: `${BASE}-error` }, t("merge.same")) : null,
					h("div", { className: `${BASE}-panel-actions` },
						h("button", {
							type: "button",
							className: `${BASE}-button`,
							onClick: () => setMode("list")
						}, t("create.cancel")),
						h("button", {
							type: "button",
							className: `${BASE}-button ${BASE}-button-primary`,
							disabled: busy || mergeSource === "" || mergeTarget === "" || mergeSource === mergeTarget,
							onClick: () => doMerge(false)
						}, t("merge.submit")))));
			const stashChangeRows = (stashFiles ?? []).map((row) => h("label", {
				key: row.path,
				className: `${BASE}-checkline`
			},
				h("input", {
					type: "checkbox",
					checked: stashChecked[row.path] === true,
					onChange: (event) => setStashChecked((current) => ({ ...current, [row.path]: event.target.checked }))
				}),
				h("span", { className: `${BASE}-check-path`, title: row.previousPath !== void 0 ? `${row.previousPath} → ${row.path}` : row.path }, row.path),
				h("span", { className: `${BASE}-check-kind` }, t(`kind.${row.kind}`))));
			const stashCheckedCount = Object.values(stashChecked).filter((value) => value === true).length;
			const stashSavePanel = h("div", { className: `${BASE}-panel` },
				h("div", { className: `${BASE}-panel-title` }, t("stash.title")),
				h("div", { className: `${BASE}-panel-hint` }, t("stash.hint")),
				stashFiles === void 0
					? h("div", { className: `${BASE}-empty` }, t("stash.loading"))
					: (stashFiles ?? []).length === 0
						? h("div", { className: `${BASE}-empty` }, t("stash.clean"))
						: h(React.Fragment, null,
						h("div", { className: `${BASE}-list-tools` },
							h("span", { className: `${BASE}-counter` }, t("push.checked", { count: stashCheckedCount })),
							h("span", { style: { display: "flex", gap: "4px" } },
								h("button", {
									type: "button",
									className: `${BASE}-link`,
									onClick: () => setStashChecked((current) => Object.fromEntries(Object.keys(current).map((path) => [path, true])))
								}, t("push.all")),
								h("button", {
									type: "button",
									className: `${BASE}-link`,
									onClick: () => setStashChecked((current) => Object.fromEntries(Object.keys(current).map((path) => [path, false])))
								}, t("push.none")))),
						h("div", { className: `${BASE}-file-list` }, stashChangeRows),
						h("label", { className: `${BASE}-field` },
							h("span", { className: `${BASE}-field-label` }, t("stash.message")),
							h("input", {
								className: `${BASE}-input`,
								type: "text",
								value: stashMessage,
								placeholder: t("stash.messagePlaceholder"),
								onChange: (event) => setStashMessage(event.target.value)
							})),
						h("label", { className: `${BASE}-checkline`, style: { cursor: "pointer" } },
							h("input", {
								type: "checkbox",
								checked: stashUntracked === true,
								onChange: (event) => setStashUntracked(event.target.checked)
							}),
							h("span", { className: `${BASE}-check-path` }, t("stash.includeUntracked")))),
				h("div", { className: `${BASE}-panel-actions` },
					h("button", {
						type: "button",
						className: `${BASE}-button`,
						onClick: () => setMode("list")
					}, t("create.cancel")),
					(stashFiles ?? []).length > 0 ? h("button", {
						type: "button",
						className: `${BASE}-button`,
						disabled: busy,
						onClick: () => doStash(true)
					}, t("stash.stashAll")) : null,
					h("button", {
						type: "button",
						className: `${BASE}-button ${BASE}-button-primary`,
						disabled: busy || stashFiles === void 0 || (stashFiles ?? []).length === 0 || stashCheckedCount === 0,
						onClick: () => doStash(false)
					}, t("stash.submit"))));
			const stashItemRows = (stashRows ?? []).map((row) => h("div", {
				key: row.ref,
				className: `${BASE}-stash-item`
			},
				h("div", { className: `${BASE}-stash-top` },
					h("span", { className: `${BASE}-stash-msg`, title: row.message }, row.message),
					row.branch !== void 0 ? h("span", { className: `${BASE}-stash-branch` }, row.branch) : null),
				h("div", { className: `${BASE}-stash-files`, title: (row.files ?? []).join("\n") }, t("stash.files", { count: (row.files ?? []).length })),
				h("div", { className: `${BASE}-stash-actions` },
					h("button", {
						type: "button",
						className: `${BASE}-link`,
						disabled: busy,
						onClick: () => doStashApply(row.ref, false, false)
					}, t("stash.apply")),
					h("button", {
						type: "button",
						className: `${BASE}-link`,
						disabled: busy,
						onClick: () => doStashApply(row.ref, true, false)
					}, t("stash.pop")),
					h("button", {
						type: "button",
						className: `${BASE}-link`,
						disabled: busy,
						onClick: () => doStashDrop(row.ref, false)
					}, t("stash.drop")))));
			const stashListPanel = h("div", { className: `${BASE}-panel` },
				h("div", { className: `${BASE}-panel-title` }, t("stash.listTitle")),
				h("div", { className: `${BASE}-panel-hint` }, t("stash.listHint")),
				stashRows === void 0
					? h("div", { className: `${BASE}-empty` }, t("stash.loading"))
					: (stashRows ?? []).length === 0
						? h("div", { className: `${BASE}-empty` }, t("stash.empty"))
						: h("div", { className: `${BASE}-file-list`, style: { gap: "8px" } }, stashItemRows),
				h("div", { className: `${BASE}-panel-actions` },
					h("button", {
						type: "button",
						className: `${BASE}-button`,
						onClick: () => setMode("list")
					}, t("create.cancel")),
					(stashRows ?? []).length > 0 ? h("button", {
						type: "button",
						className: `${BASE}-button`,
						disabled: busy,
						onClick: () => doStashDrop("", true)
					}, t("stash.dropAll")) : null));
			const stashPanel = stashMode === "list" ? stashListPanel : stashSavePanel;
			const diffFileRows = (diffFiles ?? []).map((row) => h("div", {
				key: row.path,
				className: `${BASE}-file-row ${diffSelected === row.path ? `${BASE}-file-row-selected` : ""}`,
				onClick: () => setDiffSelected(row.path)
			},
				h("span", { className: `${BASE}-file-kind ${BASE}-file-kind-${row.kind}` }, row.kind[0].toUpperCase()),
				h("span", { className: `${BASE}-file-path`, title: row.path }, row.path)));
			const diffHunks = diffPatch.split(/(?=^@@\s+[-+][0-9]+)/mu).map((hunk, index) => h("pre", {
				key: index,
				className: `${BASE}-diff-hunk`
			}, hunk));
			const diffPanel = h("div", { className: `${BASE}-panel` },
				h("div", { className: `${BASE}-panel-title` }, t("diff.title")),
				h("div", { className: `${BASE}-panel-hint` }, t("diff.hint")),
				h("div", { className: `${BASE}-diff-scope` },
					h("select", {
						className: `${BASE}-select`,
						value: diffScope,
						onChange: (event) => {
							setDiffScope(event.target.value);
							loadDiff(event.target.value);
						}
					},
						h("option", { value: "all" }, t("diff.scopeAll")),
						...(snapshots.length > 0 ? [h("option", { value: snapshots[snapshots.length - 1].id, key: snapshots[snapshots.length - 1].id }, t("diff.scopeRecent"))] : []))),
				diffFiles === void 0
					? h("div", { className: `${BASE}-empty` }, t("diff.loading"))
					: diffFiles.length === 0
						? h("div", { className: `${BASE}-empty` }, t("diff.empty"))
						: h("div", { className: `${BASE}-diff-layout` },
							h("div", { className: `${BASE}-diff-files` }, diffFileRows),
							h("div", { className: `${BASE}-diff-body` }, diffHunks)),
				h("div", { className: `${BASE}-panel-actions` },
					h("button", {
						type: "button",
						className: `${BASE}-button`,
						onClick: () => setMode("list")
					}, t("create.cancel"))));
			const menuContent = open ? h("div", {
				className: `${BASE}-menu ${BASE}-root ${panelMode ? `${BASE}-menu-panel` : ""}`,
				ref: menuRef,
				role: "menu",
				style: panelMode
					? { position: "fixed", right: "12px", top: `${frameTopReserve()}px`, width: "380px", maxHeight: `calc(100vh - ${frameTopReserve() + 24}px)` }
					: position === void 0
						? { visibility: "hidden" }
						: { left: `${position.left}px`, top: `${position.top}px`, maxHeight: `${position.maxHeight}px` }
			},
				mode === "create" ? createPanel
					: mode === "push" ? pushPanel
						: mode === "merge" ? mergePanel
							: mode === "stash" ? stashPanel
								: mode === "diff" ? diffPanel
									: listPanel,
				noticeLine,
				confirmNotice,
				errorNotice) : null;
			// The panel is portaled to the document root so the composer's own
			// stacking context and clipping cannot hide it; hosts without a
			// portal render it in place instead.
			const menu = ReactDOM === null || typeof document === "undefined"
				? menuContent
				: ReactDOM.createPortal(menuContent, document.body);
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
