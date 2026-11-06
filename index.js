/**
 * Host half of the Git branch switcher plugin.
 *
 * Exposes one Typert Remote service `branchSwitcher` with eight direct methods:
 * - `status`: resolve the session's effective working directory, detect the
 *   enclosing git repository, and collect the current branch, local branches,
 *   and remote-tracking branches.
 * - `checkout`: switch to a selected local branch, asking the UI to confirm
 *   first when the working tree is dirty or the target branch is missing; a
 *   remote-only branch creates its local tracking branch on the way.
 * - `fetch`: run `git fetch --all --prune` so remote-tracking branches catch up.
 * - `create`: create a branch from a chosen base branch and switch the session
 *   onto the new branch right away, recording the pull source in local config.
 * - `changes`: list the working-tree changes with their kind and the number of
 *   unpushed commits on the current branch.
 * - `push`: stage a chosen subset of changes, commit them with a supplied
 *   message, and push to the upstream remote branch, establishing it on the way.
 * - `merge`: merge a source branch into a target branch and restore the branch
 *   the user started on; conflicts leave the repository mid-merge with the
 *   conflicting files listed.
 * - `mergeAbort`: abort an in-progress merge and restore the pre-merge state.
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
const STATUS_CACHE_MS = 3000;
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
		/** @type {Map<string, {at: number, value: object}>} short-lived status cache keyed by toplevel, so switching conversations renders instantly. */
		this.statusCache = new Map();
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
		const cached = this.statusCache.get(toplevel);
		if (cached !== undefined && Date.now() - cached.at < STATUS_CACHE_MS) {
			return cached.value;
		}
		// One for-each-ref covers both local and remote refs, and the independent
		// reads run concurrently, so a cold status costs two git spawns total.
		const [head, refs, dirty] = await Promise.all([
			runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", "HEAD"], signal),
			runGit(this.ctx, toplevel, [
				"for-each-ref",
				"--sort=-committerdate",
				"--format=%(refname)%09%(HEAD)",
				"refs/heads",
				"refs/remotes"
			], signal),
			runGit(this.ctx, toplevel, ["status", "--porcelain"], signal)
		]);
		const rawCurrent = head.exitCode === 0 ? head.stdout.trim() : "";
		const detached = rawCurrent === "" || rawCurrent === "HEAD";
		// for-each-ref sorts both refspecs together, so collect local names in a
		// first pass before marking which remote rows already exist locally.
		const parsed = [];
		for (const line of refs.stdout.split(/\r?\n/u)) {
			if (line.trim().length === 0) continue;
			const [refname, marker = ""] = line.split("\t");
			const name = refname.trim();
			if (name.startsWith("refs/heads/")) {
				parsed.push({ kind: "local", short: name.slice("refs/heads/".length), current: marker.trim() === "*" });
			} else if (name.startsWith("refs/remotes/")) {
				const rest = name.slice("refs/remotes/".length);
				const slash = rest.indexOf("/");
				if (slash <= 0) continue;
				const short = rest.slice(slash + 1);
				if (short.length === 0 || short === "HEAD") continue;
				parsed.push({ kind: "remote", name: rest, short, remote: rest.slice(0, slash) });
			}
		}
		const localNames = new Set(parsed.filter((row) => row.kind === "local").map((row) => row.short));
		const branches = [];
		const remoteBranches = [];
		for (const row of parsed) {
			if (row.kind === "local") {
				branches.push({ name: row.short, current: row.current });
			} else {
				remoteBranches.push({ name: row.name, short: row.short, remote: row.remote, local: localNames.has(row.short) });
			}
		}
		const value = {
			repository: true,
			toplevel,
			current: detached ? undefined : rawCurrent,
			detached,
			branches: branches.slice(0, MAX_BRANCHES),
			remoteBranches: remoteBranches.slice(0, MAX_BRANCHES),
			dirtyLines: dirty.exitCode === 0 ? countLines(dirty.stdout) : 0
		};
		this.statusCache.set(toplevel, { at: Date.now(), value });
		if (this.statusCache.size > 8) {
			const oldest = this.statusCache.keys().next().value;
			this.statusCache.delete(oldest);
		}
		return value;
	}

	/** Drop the cached status of one repository so the next read re-runs git. */
	invalidateStatus(toplevel) {
		// git prints forward slashes while Node callers pass backslashes on Windows.
		this.statusCache.delete(toplevel.replaceAll("\\", "/"));
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
		this.invalidateStatus(toplevel);
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
		this.invalidateStatus(toplevel);
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
		const baseLocal = known.includes(base)
			? base
			: (remoteRefs.find((ref) => ref.name === startPoint) ?? remoteRefs.find((ref) => ref.short === base))?.short ?? base;
		await runGit(this.ctx, toplevel, ["config", `branch.${name}.dsh-base`, baseLocal], signal);
		this.invalidateStatus(toplevel);
		return { ...(await this.status(request, signal)), created: true, createdBranch: name };
	}

	/**
	 * List the working-tree changes and the unpushed commit count. Optionally
	 * infers the default merge target for a source branch so the merge panel can
	 * preselect it.
	 * @param request - Request object carrying the session identity and an optional branch to infer a merge target for.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns Typed change rows, the unpushed count, and optionally the inferred merge target.
	 */
	async changes(request, signal) {
		const toplevel = await this.requireToplevel(request.sessionId, signal);
		const statusOut = await runGit(this.ctx, toplevel, ["status", "--porcelain", "-z"], signal);
		if (statusOut.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/status-failed", gitMessage(statusOut, "git status failed"), {});
		}
		const files = this.parseChanges(statusOut.stdout);
		const head = await runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", "HEAD"], signal);
		const current = head.exitCode === 0 ? head.stdout.trim() : "";
		const detached = current === "" || current === "HEAD";
		const unpushed = await this.unpushedCount(toplevel, signal);
		const remotes = await runGit(this.ctx, toplevel, ["remote"], signal);
		const merging = await this.mergingInProgress(toplevel, signal);
		const result = {
			repository: true,
			toplevel,
			current: detached ? undefined : current,
			files,
			unpushedCount: unpushed,
			remotes: remotes.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0),
			merging,
			...(merging ? { conflictFiles: await this.conflictedFiles(toplevel, signal) } : {})
		};
		const source = request.inferTargetFor;
		if (typeof source === "string" && source.length > 0) {
			const listing = await runGit(this.ctx, toplevel, ["for-each-ref", "--format=%(refname:short)", "refs/heads"], signal);
			const known = listing.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
			if (known.includes(source)) {
				result.inferredTarget = await this.inferMergeTarget(toplevel, source, known, signal);
			}
		}
		return result;
	}

	/**
	 * Stage the chosen subset of changes, commit them, and push the branch,
	 * establishing the upstream on the first push.
	 * @param request - Request object carrying the session identity, checked file paths, commit message, and a push-all flag.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The pushed branch, upstream, and trimmed push output.
	 */
	async push(request, signal) {
		const toplevel = await this.requireToplevel(request.sessionId, signal);
		const remotes = await runGit(this.ctx, toplevel, ["remote"], signal);
		const remoteNames = remotes.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
		if (remoteNames.length === 0) {
			throw new RemoteError("branchSwitcher/no-remote", "this repository has no remote configured", {});
		}
		const head = await runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", "HEAD"], signal);
		const current = head.exitCode === 0 ? head.stdout.trim() : "";
		if (current === "" || current === "HEAD") {
			throw new RemoteError("branchSwitcher/detached-head", "cannot push while HEAD is detached", {});
		}
		const checked = Array.isArray(request.files)
			? request.files.filter((path) => typeof path === "string" && path.length > 0)
			: [];
		const message = typeof request.message === "string" ? request.message.trim() : "";
		const unpushed = await this.unpushedCount(toplevel, signal);
		if (checked.length === 0 && request.pushAll !== true && unpushed === 0) {
			throw new RemoteError("branchSwitcher/nothing-staged", "no changes are checked and no commits are waiting to push", {});
		}
		if (checked.length > 0) {
			const statusOut = await runGit(this.ctx, toplevel, ["status", "--porcelain", "-z"], signal);
			if (statusOut.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/status-failed", gitMessage(statusOut, "git status failed"), {});
			}
			const wanted = new Set(checked);
			const stageSet = new Set();
			for (const row of this.parseChanges(statusOut.stdout)) {
				if (wanted.has(row.path)) {
					stageSet.add(row.path);
					if (row.previousPath !== undefined) stageSet.add(row.previousPath);
				}
			}
			if (stageSet.size === 0) {
				throw new RemoteError("branchSwitcher/nothing-staged", "none of the checked files have pending changes", {});
			}
			if (message.length === 0) {
				throw new RemoteError("branchSwitcher/empty-message", "a commit message is required when committing changes", {});
			}
			const pathspecs = [...stageSet].map((path) => `:(literal)${path}`);
			const added = await runGit(this.ctx, toplevel, ["add", "--", ...pathspecs], signal);
			if (added.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/add-failed", gitMessage(added, "git add failed"), {});
			}
			const committed = await runGit(this.ctx, toplevel, ["commit", "-m", message], signal);
			if (committed.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/commit-failed", gitMessage(committed, "git commit failed"), {});
			}
		}
		const upstreamBefore = await runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], signal);
		const pushArgs = upstreamBefore.exitCode === 0
			? ["push"]
			: ["push", "-u", remoteNames.includes("origin") ? "origin" : remoteNames[0], "HEAD"];
		const pushed = await runGit(this.ctx, toplevel, pushArgs, signal);
		if (pushed.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/push-rejected", gitMessage(pushed, "git push failed"), {});
		}
		const upstreamAfter = await runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], signal);
		const output = (pushed.stderr || pushed.stdout).trim().replace(/\s+/gu, " ").slice(-MAX_FETCH_OUTPUT);
		this.invalidateStatus(toplevel);
		return {
			pushed: true,
			branch: current,
			upstream: upstreamAfter.exitCode === 0 ? upstreamAfter.stdout.trim() : undefined,
			output: output.length > 0 ? output : undefined
		};
	}

	/**
	 * Merge a source branch into a target branch and restore the branch the
	 * session started on. Conflicts leave the repository mid-merge with the
	 * conflicting files listed so the user can resolve or abort.
	 * @param request - Request object carrying the session identity, source and target branches, and the confirmation flag.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns A confirmation request, the merge result, or the conflict listing.
	 */
	async merge(request, signal) {
		const source = request.source;
		const target = request.target;
		assertBranchName(source);
		assertBranchName(target);
		if (source === target) {
			throw new RemoteError("branchSwitcher/invalid-merge", "source and target branches must differ", {});
		}
		const toplevel = await this.requireToplevel(request.sessionId, signal);
		const listing = await runGit(this.ctx, toplevel, ["for-each-ref", "--format=%(refname:short)", "refs/heads"], signal);
		const known = listing.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
		if (!known.includes(source)) {
			throw new RemoteError("branchSwitcher/base-missing", `source branch not found: ${source.slice(0, 60)}`, {});
		}
		if (!known.includes(target)) {
			throw new RemoteError("branchSwitcher/base-missing", `target branch not found: ${target.slice(0, 60)}`, {});
		}
		if (await this.mergingInProgress(toplevel, signal)) {
			return { conflicted: true, files: await this.conflictedFiles(toplevel, signal) };
		}
		const head = await runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", "HEAD"], signal);
		const original = head.exitCode === 0 ? head.stdout.trim() : "";
		const dirty = await runGit(this.ctx, toplevel, ["status", "--porcelain"], signal);
		const dirtyFiles = dirty.exitCode === 0 ? countLines(dirty.stdout) : 0;
		if (dirtyFiles > 0 && request.confirmed !== true) {
			return { requireConfirm: true, dirtyFiles };
		}
		if (original !== target) {
			const switched = await runGit(this.ctx, toplevel, ["switch", target], signal);
			if (switched.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/switch-failed", gitMessage(switched, "git switch failed"), {});
			}
		}
		const merged = await runGit(this.ctx, toplevel, ["merge", source], signal);
		if (merged.exitCode !== 0) {
			const files = await this.conflictedFiles(toplevel, signal);
			if (files.length > 0) {
				return { conflicted: true, files, branch: target };
			}
			await runGit(this.ctx, toplevel, ["merge", "--abort"], signal);
			if (original !== target && original !== "" && original !== "HEAD") {
				await runGit(this.ctx, toplevel, ["switch", original], signal);
			}
			throw new RemoteError("branchSwitcher/merge-failed", gitMessage(merged, "git merge failed"), {});
		}
		const output = merged.stdout.trim();
		const mode = /already up to date/iu.test(output)
			? "up-to-date"
			: /fast-forward/iu.test(output)
				? "fast-forward"
				: "true";
		let restoredTo;
		if (original !== target && original !== "" && original !== "HEAD") {
			const back = await runGit(this.ctx, toplevel, ["switch", original], signal);
			if (back.exitCode === 0) restoredTo = original;
		}
		this.invalidateStatus(toplevel);
		return { merged: true, mode, restoredTo, branch: target };
	}

	/**
	 * Abort the in-progress merge and restore the pre-merge state.
	 * @param request - Request object carrying the session identity.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The refreshed repository state plus the abort flag.
	 */
	async mergeAbort(request, signal) {
		const toplevel = await this.requireToplevel(request.sessionId, signal);
		if (!(await this.mergingInProgress(toplevel, signal))) {
			throw new RemoteError("branchSwitcher/not-merging", "no merge is in progress", {});
		}
		const aborted = await runGit(this.ctx, toplevel, ["merge", "--abort"], signal);
		if (aborted.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/abort-failed", gitMessage(aborted, "git merge --abort failed"), {});
		}
		this.invalidateStatus(toplevel);
		return { ...(await this.status(request, signal)), aborted: true };
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

	/**
	 * Resolve the repository root for a session or fail with a structured error.
	 * @param sessionId - Session identity.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The repository toplevel directory.
	 */
	async requireToplevel(sessionId, signal) {
		const cwd = await this.sessionDirectory(sessionId, signal);
		const top = await runGit(this.ctx, cwd, ["rev-parse", "--show-toplevel"], signal);
		if (top.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/no-repository", "the session working directory is not inside a git repository", {});
		}
		return top.stdout.trim();
	}

	/**
	 * Parse `git status --porcelain -z` into typed change rows.
	 * @param stdout - Nul-delimited porcelain v1 output.
	 * @returns Change rows with path, original path for renames, and a kind label.
	 */
	parseChanges(stdout) {
		const entries = stdout.split("\u0000").filter((entry) => entry.length > 0);
		const rows = [];
		for (const entry of entries) {
			const code = entry.slice(0, 2);
			let path = entry.slice(3);
			let previousPath;
			let kind;
			if (code[0] === "R" || code[1] === "R") {
				const split = path.indexOf("\u0000");
				previousPath = path.slice(0, split);
				path = path.slice(split + 1);
				kind = "renamed";
			} else if (code === "??") {
				kind = "untracked";
			} else if (code[0] === "A" || code[1] === "A") {
				kind = "added";
			} else if (code[0] === "D" || code[1] === "D") {
				kind = "deleted";
			} else {
				kind = "modified";
			}
			rows.push({ path, kind, ...(previousPath === undefined ? {} : { previousPath }) });
			if (rows.length >= MAX_BRANCHES) break;
		}
		return rows;
	}

	/**
	 * Count commits on the current branch that its upstream does not have.
	 * @param toplevel - Repository root directory.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The unpushed commit count, or 0 when no upstream exists.
	 */
	async unpushedCount(toplevel, signal) {
		const result = await runGit(this.ctx, toplevel, ["rev-list", "--count", "@{u}..HEAD"], signal);
		if (result.exitCode !== 0) return 0;
		const count = Number.parseInt(result.stdout.trim(), 10);
		return Number.isFinite(count) && count > 0 ? count : 0;
	}

	/**
	 * Read the pull source recorded when the branch was created by this plugin.
	 * @param toplevel - Repository root directory.
	 * @param branch - Local branch name.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The recorded base branch, or undefined when absent.
	 */
	async recordedBase(toplevel, branch, signal) {
		const result = await runGit(this.ctx, toplevel, ["config", "--get", `branch.${branch}.dsh-base`], signal);
		if (result.exitCode !== 0) return undefined;
		const value = result.stdout.trim();
		return value.length > 0 ? value : undefined;
	}

	/**
	 * Infer the default merge target for a source branch with a three-level
	 * fallback: the recorded pull source, the local counterpart of the upstream,
	 * then the local branch sharing the closest merge base.
	 * @param toplevel - Repository root directory.
	 * @param source - Source branch name.
	 * @param known - Existing local branch names.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The inferred target branch name.
	 */
	async inferMergeTarget(toplevel, source, known, signal) {
		const others = known.filter((name) => name !== source);
		if (others.length === 0) return source;
		const recorded = await this.recordedBase(toplevel, source, signal);
		if (recorded !== undefined && known.includes(recorded) && recorded !== source) return recorded;
		const upstream = await runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", `${source}@{u}`], signal);
		if (upstream.exitCode === 0) {
			const short = upstream.stdout.trim().replace(/^[^/]+\//u, "");
			if (short.length > 0 && known.includes(short) && short !== source) return short;
		}
		const head = await runGit(this.ctx, toplevel, ["rev-parse", "--verify", `${source}`], signal);
		if (head.exitCode === 0) {
			const baseCommit = head.stdout.trim();
			const isTrunk = (name) => name === "master" || name === "main";
			let best;
			let bestDistance = Number.POSITIVE_INFINITY;
			for (const candidate of others) {
				const mergeBase = await runGit(this.ctx, toplevel, ["merge-base", candidate, source], signal);
				if (mergeBase.exitCode !== 0) continue;
				const distance = await runGit(this.ctx, toplevel, ["rev-list", "--count", `${mergeBase.stdout.trim()}..${candidate}`], signal);
				if (distance.exitCode !== 0) continue;
				const value = Number.parseInt(distance.stdout.trim(), 10);
				if (!Number.isFinite(value)) continue;
				const wins = value < bestDistance
					|| (value === bestDistance && best !== undefined && isTrunk(candidate) && !isTrunk(best));
				if (wins) {
					best = candidate;
					bestDistance = value;
				}
			}
			if (best !== undefined) return best;
		}
		for (const fallback of ["master", "main"]) {
			if (others.includes(fallback)) return fallback;
		}
		return others[0];
	}

	/**
	 * Check whether the repository is mid-merge.
	 * @param toplevel - Repository root directory.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns True when MERGE_HEAD exists.
	 */
	async mergingInProgress(toplevel, signal) {
		const result = await runGit(this.ctx, toplevel, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], signal);
		return result.exitCode === 0;
	}

	/**
	 * List the files an in-progress merge still needs a decision on.
	 * @param toplevel - Repository root directory.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns Unmerged file paths.
	 */
	async conflictedFiles(toplevel, signal) {
		const result = await runGit(this.ctx, toplevel, ["diff", "--name-only", "--diff-filter=U"], signal);
		if (result.exitCode !== 0) return [];
		return result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
	}
}

markRemote(BranchSwitcherService.prototype, "status");
markRemote(BranchSwitcherService.prototype, "checkout");
markRemote(BranchSwitcherService.prototype, "fetch");
markRemote(BranchSwitcherService.prototype, "create");
markRemote(BranchSwitcherService.prototype, "changes");
markRemote(BranchSwitcherService.prototype, "push");
markRemote(BranchSwitcherService.prototype, "merge");
markRemote(BranchSwitcherService.prototype, "mergeAbort");
