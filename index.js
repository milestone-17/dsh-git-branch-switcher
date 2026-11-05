/**
 * Host half of the Git branch switcher plugin.
 *
 * Exposes one Typert Remote service `branchSwitcher` with two direct methods:
 * - `status`: resolve the session's effective working directory, detect the
 *   enclosing git repository, and collect the current branch plus local branches.
 * - `checkout`: switch to a selected local branch, asking the UI to confirm
 *   first when the working tree is dirty or the target branch is missing.
 *
 * Git runs through the harness subprocess seam with collected stdio, so no
 * shell is involved and the child inherits no harness credential environment.
 */
import { RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/** Prototype descriptor key the Gateway reads to discover Remote methods. */
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const MAX_GIT_OUTPUT_BYTES = 1 << 20;
const MAX_BRANCHES = 500;
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
		const dirty = await runGit(this.ctx, toplevel, ["status", "--porcelain"], signal);
		return {
			repository: true,
			toplevel,
			current: detached ? undefined : current,
			detached,
			branches,
			dirtyLines: dirty.exitCode === 0 ? countLines(dirty.stdout) : 0
		};
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
		const known = listing.stdout.split(/\r?\n/u).map((line) => line.trim());
		const targetMissing = !known.includes(branch);
		if ((dirtyFiles > 0 || targetMissing) && request.confirmed !== true) {
			return { requireConfirm: true, dirtyFiles, targetMissing };
		}
		const result = await runGit(this.ctx, toplevel, ["switch", branch], signal);
		if (result.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/switch-failed", gitMessage(result, "git switch failed"), {});
		}
		return { ...(await this.status(request, signal)), switched: true };
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
