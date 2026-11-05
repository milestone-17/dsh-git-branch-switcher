/**
 * Host half of the Git branch switcher plugin.
 *
 * Exposes one Typert Remote service `branchSwitcher` with four direct methods:
 * - `status`: resolve the session's effective working directory, detect the
 *   enclosing git repository, and collect the current branch, local branches,
 *   and remote-tracking branches.
 * - `checkout`: switch to a selected local branch, asking the UI to confirm
 *   first when the working tree is dirty or the target branch is missing; a
 *   remote-only branch creates its local tracking branch on the way.
 * - `fetch`: run `git fetch --all --prune` so remote-tracking branches catch up.
 * - `create`: create a branch from a chosen base branch and switch the session
 *   onto the new branch right away.
 *
 * Git runs through the harness subprocess seam with collected stdio, so no
 * shell is involved and the child inherits no harness credential environment.
 */
import { RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/** Prototype descriptor key the Gateway reads to discover Remote methods. */
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const MAX_GIT_OUTPUT_BYTES = 1 << 20;
const MAX_BRANCHES = 500;
const MAX_FETCH_OUTPUT = 400;
const NOT_A_REPOSITORY = /not\s+a\s+git\s+repository/iu;

/** Mark one prototype method as a direct Remote call, replacing the decorator in plain JS. */
function markRemote(prototype, method) {
	const previous = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR)?.value;
	const methods = (previous?.methods ?? []).filter((marker) => marker.method !== method);
	Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
		configurable: true,
		value: Object.freeze({
			version: 1,
			methods: Object.freeze([...methods, Object.freeze({
				method,
				invocation: Object.freeze({ kind: "direct" })
			})])
		})
	});
}

/** Count non-empty porcelain lines without treating whitespace-only output as changes. */
function countLines(stdout) {
	return stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0).length;
}

/** Trim one git error surface into a wire-safe message. */
function gitMessage(result, fallback) {
	return (result.stderr || result.stdout || fallback).trim().slice(0, 400);
}

/** Reject branch names that could smuggle options or references out of `git switch`. */
function assertBranchName(branch) {
	if (typeof branch !== "string" || branch.length === 0 || branch.length > 300) {
		throw new RemoteError("branchSwitcher/invalid-branch", "branch name must be a non-empty string", {});
	}
	if (/^[-\s]/u.test(branch) || /[\s\u0000-\u001f]/u.test(branch) || /\.\./u.test(branch) || /[~/\^:]$/u.test(branch) || branch.endsWith(".lock") || branch.endsWith("/")) {
		throw new RemoteError("branchSwitcher/invalid-branch", `branch name is not switchable: ${branch.slice(0, 60)}`, {});
	}
}

/** One bounded, shell-free git invocation in the given directory. */
async function runGit(ctx, cwd, args, signal) {
	const subprocess = ctx.subprocess;
	let git;
	try {
		git = await subprocess.resolveExecutable("git", undefined, signal);
	} catch (error) {
		throw new RemoteError("branchSwitcher/git-missing", `git executable unavailable: ${String(error?.message ?? error)}`, {});
	}
	const handle = subprocess.spawn({
		argv: [git, ...args],
		cwd,
		stdio: { stdout: { maxBytes: MAX_GIT_OUTPUT_BYTES }, stderr: { maxBytes: MAX_GIT_OUTPUT_BYTES } },
		graceMs: 1000,
		signal
	});
	const outcome = await handle.done;
	return {
		exitCode: outcome.exitCode,
		stdout: handle.collected.stdout.readFrom(0).text,
		stderr: handle.collected.stderr.readFrom(0).text
	};
}

export default class BranchSwitcherService extends TypertRemoteService {
	static inject = ["subprocess", "sessionController", "workingDirectory"];

	constructor(ctx, config) {
		super(ctx, "branchSwitcher", { namespace: "branchSwitcher" });
		this.config = config;
	}

	/**
	 * Read the repository state around the session's working directory.
	 * @param request - Request object carrying the session identity.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns Repository presence, current branch, branch rows, and change count.
	 */
	async status(request, signal) {
		const cwd = await this.sessionDirectory(request.sessionId, signal);
		const top = await runGit(this.ctx, cwd, ["rev-parse", "--show-toplevel"], signal);
		if (top.exitCode !== 0) {
			if (NOT_A_REPOSITORY.test(top.stderr) || NOT_A_REPOSITORY.test(top.stdout)) {
				return { repository: false };
			}
			return { repository: false };
		}
		const toplevel = top.stdout.trim();
		const head = await runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", "HEAD"], signal);
		const current = head.exitCode === 0 ? head.stdout.trim() : "";
		const detached = current === "" || current === "HEAD";
		const listing = await runGit(this.ctx, toplevel, [
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname:short)%09%(HEAD)",
			`refs/heads`
		], signal);
		const branches = [];
		for (const line of listing.stdout.split(/\r?\n/u)) {
			if (line.trim().length === 0) continue;
			const [name, marker] = line.split("\t");
			branches.push({ name: name.trim(), current: marker?.trim() === "*" });
			if (branches.length >= MAX_BRANCHES) break;
		}
		const remoteBranches = await this.remoteBranches(toplevel, branches, signal);
		const dirty = await runGit(this.ctx, toplevel, ["status", "--porcelain"], signal);
		return {
			repository: true,
			toplevel,
			current: detached ? undefined : current,
			detached,
			branches,
			remoteBranches,
			dirtyLines: dirty.exitCode === 0 ? countLines(dirty.stdout) : 0
		};
	}

	/**
	 * Fetch every configured remote so remote-tracking branches catch up.
	 * @param request - Request object carrying the session identity.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The refreshed repository state plus the trimmed fetch output.
	 */
	async fetch(request, signal) {
		const cwd = await this.sessionDirectory(request.sessionId, signal);
		const top = await runGit(this.ctx, cwd, ["rev-parse", "--show-toplevel"], signal);
		if (top.exitCode !== 0) {
			return { repository: false, fetched: false };
		}
		const toplevel = top.stdout.trim();
		const result = await runGit(this.ctx, toplevel, ["fetch", "--all", "--prune"], signal);
		if (result.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/fetch-failed", gitMessage(result, "git fetch failed"), {});
		}
		const output = (result.stderr || result.stdout).trim().replace(/\s+/gu, " ").slice(-MAX_FETCH_OUTPUT);
		return { ...(await this.status(request, signal)), fetched: true, output: output.length > 0 ? output : undefined };
	}

	/**
	 * Switch to one local branch, confirming dirty or missing targets first.
	 * @param request - Request object carrying the session identity, target branch, and confirmation flag.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns A confirmation request, or the new repository state.
	 */
	async checkout(request, signal) {
		const branch = request.branch;
		assertBranchName(branch);
		const cwd = await this.sessionDirectory(request.sessionId, signal);
		const top = await runGit(this.ctx, cwd, ["rev-parse", "--show-toplevel"], signal);
		if (top.exitCode !== 0) {
			return { repository: false };
		}
		const toplevel = top.stdout.trim();
		const dirty = await runGit(this.ctx, toplevel, ["status", "--porcelain"], signal);
		const dirtyFiles = dirty.exitCode === 0 ? countLines(dirty.stdout) : 0;
		const listing = await runGit(this.ctx, toplevel, ["for-each-ref", "--format=%(refname:short)", "refs/heads"], signal);
		const known = listing.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
		const remoteRefs = await this.remoteRefs(toplevel, signal);
		const target = this.resolveTarget(branch, known, remoteRefs);
		const targetMissing = target === null;
		if ((dirtyFiles > 0 || targetMissing) && request.confirmed !== true) {
			return { requireConfirm: true, dirtyFiles, targetMissing };
		}
		if (target === null) {
			throw new RemoteError("branchSwitcher/switch-failed", `branch not found: ${branch.slice(0, 60)}`, {});
		}
		const result = await runGit(this.ctx, toplevel, target.args, signal);
		if (result.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/switch-failed", gitMessage(result, "git switch failed"), {});
		}
		return { ...(await this.status(request, signal)), switched: true };
	}

	/**
	 * Create a branch from a chosen base and switch the session onto it.
	 * @param request - Request object carrying the session identity, the new branch name, the base branch, and the confirmation flag.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns A confirmation request, or the new repository state.
	 */
	async create(request, signal) {
		const name = request.name;
		assertBranchName(name);
		const base = request.base;
		if (typeof base !== "string" || base.length === 0) {
			throw new RemoteError("branchSwitcher/invalid-base", "base branch must be a non-empty string", {});
		}
		assertBranchName(base);
		const cwd = await this.sessionDirectory(request.sessionId, signal);
		const top = await runGit(this.ctx, cwd, ["rev-parse", "--show-toplevel"], signal);
		if (top.exitCode !== 0) {
			return { repository: false };
		}
		const toplevel = top.stdout.trim();
		const listing = await runGit(this.ctx, toplevel, ["for-each-ref", "--format=%(refname:short)", "refs/heads"], signal);
		const known = listing.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
		if (known.includes(name)) {
			throw new RemoteError("branchSwitcher/branch-exists", `branch already exists: ${name.slice(0, 60)}`, {});
		}
		const remoteRefs = await this.remoteRefs(toplevel, signal);
		const startPoint = this.resolveBase(base, known, remoteRefs);
		if (startPoint === null) {
			throw new RemoteError("branchSwitcher/base-missing", `base branch not found: ${base.slice(0, 60)}`, {});
		}
		const dirty = await runGit(this.ctx, toplevel, ["status", "--porcelain"], signal);
		const dirtyFiles = dirty.exitCode === 0 ? countLines(dirty.stdout) : 0;
		if (dirtyFiles > 0 && request.confirmed !== true) {
			return { requireConfirm: true, dirtyFiles, targetMissing: false };
		}
		const result = await runGit(this.ctx, toplevel, ["switch", "-c", name, startPoint], signal);
		if (result.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/create-failed", gitMessage(result, "git switch failed"), {});
		}
		return { ...(await this.status(request, signal)), created: true, createdBranch: name };
	}

	/**
	 * Collect remote-tracking branches, newest first, and mark the ones whose
	 * short name already has a local branch.
	 * @param toplevel - Repository root directory.
	 * @param branches - Known local branch rows.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns Remote-tracking branch rows.
	 */
	async remoteBranches(toplevel, branches, signal) {
		const localNames = new Set(branches.map((branch) => branch.name));
		const rows = [];
		for (const ref of await this.remoteRefs(toplevel, signal)) {
			rows.push({ name: ref.name, short: ref.short, remote: ref.remote, local: localNames.has(ref.short) });
			if (rows.length >= MAX_BRANCHES) break;
		}
		return rows;
	}

	/**
	 * List remote-tracking references as full name, short name, and remote.
	 * @param toplevel - Repository root directory.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns Remote-tracking reference rows without the symbolic HEAD entries.
	 */
	async remoteRefs(toplevel, signal) {
		const listing = await runGit(this.ctx, toplevel, [
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname:short)%09%(refname:strip=3)",
			"refs/remotes"
		], signal);
		const refs = [];
		for (const line of listing.stdout.split(/\r?\n/u)) {
			if (line.trim().length === 0) continue;
			const [name, short] = line.split("\t");
			const full = name.trim();
			const local = (short ?? "").trim();
			if (full.length === 0 || local.length === 0 || local === "HEAD") continue;
			const slash = full.indexOf("/");
			if (slash <= 0) continue;
			refs.push({ name: full, short: local, remote: full.slice(0, slash) });
		}
		return refs;
	}

	/**
	 * Resolve one requested branch into the git arguments that switch to it.
	 * @param branch - Requested branch name, either local or a remote-tracking name.
	 * @param known - Existing local branch names.
	 * @param remoteRefs - Known remote-tracking references.
	 * @returns The `git switch` arguments, or null when nothing matches.
	 */
	resolveTarget(branch, known, remoteRefs) {
		if (known.includes(branch)) {
			return { args: ["switch", branch], created: false };
		}
		const exact = remoteRefs.find((ref) => ref.name === branch);
		const candidates = exact === undefined
			? remoteRefs.filter((ref) => ref.short === branch)
			: [exact];
		if (candidates.length !== 1) return null;
		const ref = candidates[0];
		if (known.includes(ref.short)) {
			return { args: ["switch", ref.short], created: false };
		}
		return { args: ["switch", "--track", ref.name], created: true };
	}

	/**
	 * Resolve the base branch of a new branch into one concrete git ref.
	 * @param base - Requested base branch, local or remote-tracking.
	 * @param known - Existing local branch names.
	 * @param remoteRefs - Known remote-tracking references.
	 * @returns The concrete start-point ref, or null when nothing matches.
	 */
	resolveBase(base, known, remoteRefs) {
		if (known.includes(base)) return base;
		const exact = remoteRefs.find((ref) => ref.name === base);
		if (exact !== undefined) return exact.name;
		const candidates = remoteRefs.filter((ref) => ref.short === base);
		if (candidates.length === 1) return candidates[0].name;
		return null;
	}

	/** Resolve the session's effective working directory through the harness owners. */
	async sessionDirectory(sessionId, signal) {
		signal?.throwIfAborted?.();
		const controller = this.ctx.sessionController;
		const found = await controller.resolveAgent(sessionId);
		if ("error" in found) throw found.error;
		try {
			return this.ctx.workingDirectory.get(found.agent.session);
		} catch {
			return this.ctx.workingDirectory.defaultDirectory;
		}
	}
}

markRemote(BranchSwitcherService.prototype, "status");
markRemote(BranchSwitcherService.prototype, "checkout");
markRemote(BranchSwitcherService.prototype, "fetch");
markRemote(BranchSwitcherService.prototype, "create");
