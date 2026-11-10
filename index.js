/**
 * Host half of the Git branch switcher plugin.
 *
 * Exposes one Typert Remote service `branchSwitcher` with fourteen direct methods:
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
 * - `snapshot`: capture the current working tree as a git tree object for later
 *   comparison.
 * - `diff`: compare two snapshots (or a snapshot against HEAD) and return the
 *   file list and unified diff patch.
 * - `push`: stage a chosen subset of changes, commit them with a supplied
 *   message, and push to the upstream remote branch, establishing it on the way.
 * - `merge`: merge a source branch into a target branch and restore the branch
 *   the user started on; conflicts leave the repository mid-merge with the
 *   conflicting files listed.
 * - `mergeAbort`: abort an in-progress merge and restore the pre-merge state.
 * - `stashList`: list stash entries with the files each one touches.
 * - `stash`: stash the checked subset of changes (or everything, including
 *   untracked files) into a new stash entry with an optional message.
 * - `stashApply`: apply one entry back (optionally popping it); a dirty tree
 *   asks for confirmation first, conflicts are reported with their files.
 * - `stashDrop`: drop one entry, or clear every entry at once.
 *
 * Git runs through the harness subprocess seam with collected stdio, so no
 * shell is involved and the child inherits no harness credential environment.
 */
import { RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Prototype descriptor key the Gateway reads to discover Remote methods. */
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const MAX_GIT_OUTPUT_BYTES = 1 << 20;
const MAX_BRANCHES = 500;
const MAX_STASHES = 50;
const MAX_FETCH_OUTPUT = 400;
const STATUS_CACHE_MS = 3000;
const TOPLEVEL_CACHE_MS = 600000;

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

/**
 * Parse the `## <branch>...<upstream> [ahead N]` header of a porcelain
 * `--branch` status into the current branch, its upstream, and the number of
 * commits the upstream does not have.
 *
 * The header is the first Nul-delimited entry of the status output; a missing
 * or malformed header yields no branch, no upstream, and a zero ahead count
 * instead of throwing, so the change rows stay usable.
 * @param stdout - Nul-delimited porcelain v1 output with the branch header.
 * @returns The current branch, its upstream when the branch tracks one, and the ahead count.
 */
function parseBranchHeader(stdout) {
	const first = stdout.split("\u0000")[0] ?? "";
	if (!first.startsWith("## ")) return { current: "", upstream: undefined, ahead: 0 };
	let rest = first.slice(3);
	const unborn = rest.startsWith("No commits yet on ");
	if (unborn) rest = rest.slice("No commits yet on ".length);
	const bracket = rest.indexOf("[");
	const aheadMatch = /\[\s*ahead (\d+)/u.exec(bracket >= 0 ? rest.slice(bracket) : "");
	const ahead = aheadMatch === null ? 0 : Number.parseInt(aheadMatch[1], 10);
	let head = (bracket >= 0 ? rest.slice(0, bracket) : rest).trim();
	let upstream;
	const dots = head.indexOf("...");
	if (dots >= 0) {
		const candidate = head.slice(dots + 3).trim();
		upstream = candidate.length > 0 ? candidate : undefined;
		head = head.slice(0, dots).trim();
	}
	if (head === "HEAD" || head === "HEAD (no branch)") return { current: "", upstream, ahead };
	return { current: head, upstream, ahead };
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

/** One bounded, shell-free git invocation with a custom environment. */
async function runGitEnv(ctx, cwd, args, env, signal) {
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
		env,
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
		/** @type {Map<string, {at: number, value: string}>} session -> repository root cache, skipping agent resolution on the hot path. */
		this.toplevelCache = new Map();
		/** @type {Map<string, Array<{id: string, at: number, tree: string, head: string}>>} session -> rolling snapshot history for diff view. */
		this.snapshots = new Map();
	}

	/**
	 * Read the repository state around the session's working directory.
	 * @param request - Request object carrying the session identity.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns Repository presence, current branch, branch rows, and change count.
	 */
	async status(request, signal) {
		let toplevel;
		try {
			toplevel = await this.requireToplevelCached(request.sessionId, signal);
		} catch {
			return { repository: false };
		}
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
	 * @returns Typed change rows, the unpushed count, the upstream branch, and optionally the inferred merge target.
	 */
	async changes(request, signal) {
		const toplevel = await this.requireToplevelCached(request.sessionId, signal);
		// One round of git: the branch header of `status --branch` carries the
		// current branch, the upstream, and the ahead count, so the separate
		// rev-parse and rev-list reads are gone. The remote list and the
		// merge-in-progress probe do not depend on it and run in the same round.
		const [statusOut, remotes, merging] = await Promise.all([
			runGit(this.ctx, toplevel, ["status", "--porcelain", "-z", "--branch"], signal),
			runGit(this.ctx, toplevel, ["remote"], signal),
			this.mergingInProgress(toplevel, signal)
		]);
		if (statusOut.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/status-failed", gitMessage(statusOut, "git status failed"), {});
		}
		const header = parseBranchHeader(statusOut.stdout);
		const files = this.parseChanges(statusOut.stdout);
		const current = header.current;
		const detached = current === "" || current === "HEAD";
		const result = {
			repository: true,
			toplevel,
			current: detached ? undefined : current,
			upstream: header.upstream,
			files,
			unpushedCount: header.ahead,
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
	 * Capture a snapshot of the current working tree as a git tree object.
	 * The snapshot id can later be passed to `diff` to compare two states.
	 * @param request - Request object carrying the session identity and an optional label.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The snapshot id and timestamp.
	 */
	async snapshot(request, signal) {
		const toplevel = await this.requireToplevelCached(request.sessionId, signal);
		const headResult = await runGit(this.ctx, toplevel, ["rev-parse", "HEAD"], signal);
		const head = headResult.exitCode === 0 ? headResult.stdout.trim() : "HEAD";
		const tmpIndex = path.join(os.tmpdir(), `dsh-gbs-${request.sessionId.replace(/[^a-z0-9]/giu, "-")}-${Date.now()}.index`);
		try {
			await runGitEnv(this.ctx, toplevel, ["read-tree", head], { GIT_INDEX_FILE: tmpIndex }, signal);
			await runGitEnv(this.ctx, toplevel, ["add", "--all"], { GIT_INDEX_FILE: tmpIndex }, signal);
			const treeResult = await runGitEnv(this.ctx, toplevel, ["write-tree"], { GIT_INDEX_FILE: tmpIndex }, signal);
			if (treeResult.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/snapshot-failed", gitMessage(treeResult, "git write-tree failed"), {});
			}
			const tree = treeResult.stdout.trim();
			const id = `${tree}:${head}`;
			const list = this.snapshots.get(request.sessionId) ?? [];
			list.push({ id, at: Date.now(), tree, head, label: request.label });
			// Keep the last 32 snapshots per session to bound memory.
			while (list.length > 32) list.shift();
			this.snapshots.set(request.sessionId, list);
			return { snapshotId: id, at: list[list.length - 1].at };
		} finally {
			await fs.unlink(tmpIndex).catch(() => {});
		}
	}

	/**
	 * Compute a diff between two snapshots, between a snapshot and HEAD, or
	 * between a snapshot and the current working tree.
	 * @param request - Request object carrying the session identity, from id, and to id.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns File list with change kinds and the unified diff patch.
	 */
	async diff(request, signal) {
		const toplevel = await this.requireToplevelCached(request.sessionId, signal);
		const resolveTree = (id) => {
			if (id === "HEAD" || id === "WORKTREE") return id;
			if (typeof id !== "string" || id.length === 0) {
				throw new RemoteError("branchSwitcher/invalid-snapshot", "snapshot id must be a non-empty string, HEAD, or WORKTREE", {});
			}
			// Snapshot ids are stored as "tree:head"; the tree is the diff operand.
			const colon = id.indexOf(":");
			return colon >= 0 ? id.slice(0, colon) : id;
		};
		const fromTree = resolveTree(request.from);
		const toTree = resolveTree(request.to);

		let files;
		let patch;
		if (toTree === "WORKTREE") {
			// Use status --porcelain so untracked files are included in the list,
			// then diff HEAD for the tracked-file patch and synthesize hunks for
			// untracked text files.
			const [statusResult, patchResult] = await Promise.all([
				runGit(this.ctx, toplevel, ["status", "--porcelain", "-z"], signal),
				runGit(this.ctx, toplevel, ["diff", ...(fromTree === "WORKTREE" ? [] : [fromTree])], signal)
			]);
			if (statusResult.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/diff-failed", gitMessage(statusResult, "git status failed"), {});
			}
			files = this.parseChanges(statusResult.stdout);
			patch = patchResult.exitCode === 0 ? patchResult.stdout : "";
			const UNTRACKED_PATCH_LIMIT = 100 * 1024;
			for (const row of files) {
				if (row.kind !== "untracked") continue;
				const fullPath = path.join(toplevel, row.path);
				let content;
				try {
					const stat = await fs.stat(fullPath);
					if (!stat.isFile() || stat.size > UNTRACKED_PATCH_LIMIT) continue;
					content = await fs.readFile(fullPath, "utf8");
				} catch {
					continue;
				}
				const lines = content.split(/\r?\n/u);
				// Ensure the content ends with a newline so the synthetic hunk
				// matches git's usual output; if not, the last line is incomplete.
				const hasTrailingNewline = content.length > 0 && content.endsWith("\n");
				if (!hasTrailingNewline && lines.length > 0) lines.pop();
				patch += `\ndiff --git a/${row.path} b/${row.path}\nnew file mode 100644\nindex 0000000..0000000\n--- /dev/null\n+++ b/${row.path}\n@@ -0,0 +1,${lines.length} @@\n`;
				for (const line of lines) {
					patch += `+${line}\n`;
				}
				if (!hasTrailingNewline && content.length > 0) {
					patch += `\\ No newline at end of file\n`;
				}
			}
		} else {
			const worktreeArgs = (tree) => tree === "WORKTREE" ? [] : [tree];
			const nameStatusArgs = ["diff", "--name-status", ...worktreeArgs(fromTree)];
			if (toTree !== "WORKTREE") nameStatusArgs.push(toTree);
			const patchArgs = ["diff", ...worktreeArgs(fromTree)];
			if (toTree !== "WORKTREE") patchArgs.push(toTree);
			const [nameStatus, patchResult] = await Promise.all([
				runGit(this.ctx, toplevel, nameStatusArgs, signal),
				runGit(this.ctx, toplevel, patchArgs, signal)
			]);
			if (nameStatus.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/diff-failed", gitMessage(nameStatus, "git diff failed"), {});
			}
			files = [];
			for (const line of nameStatus.stdout.split(/\r?\n/u)) {
				if (line.trim().length === 0) continue;
				const parts = line.split("\t");
				const status = parts[0];
				const kind = status === "A" ? "added" : status === "D" ? "deleted" : status.startsWith("R") ? "renamed" : "modified";
				const entry = { kind, path: parts[1] };
				if (kind === "renamed" && parts.length > 2) entry.previousPath = parts[2];
				files.push(entry);
			}
			patch = patchResult.exitCode === 0 ? patchResult.stdout : "";
		}
		return { files, patch };
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
	 * Cached requireToplevel: the session directory rarely changes mid-session,
	 * so repeat calls skip both the agent resolution and the rev-parse spawn
	 * until the TTL lapses or the cached root stops matching reality.
	 * @param sessionId - Session identity.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The repository toplevel directory.
	 */
	async requireToplevelCached(sessionId, signal) {
		const cached = this.toplevelCache.get(sessionId);
		if (cached !== undefined && Date.now() - cached.at < TOPLEVEL_CACHE_MS) return cached.value;
		const value = await this.requireToplevel(sessionId, signal);
		this.toplevelCache.set(sessionId, { at: Date.now(), value });
		if (this.toplevelCache.size > 16) {
			const oldest = this.toplevelCache.keys().next().value;
			this.toplevelCache.delete(oldest);
		}
		return value;
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
			// `## <branch>...<upstream> [ahead N]` is the branch header of
			// `status --branch`, not a change row.
			if (code === "##") continue;
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
			const isTrunk = (name) => name === "master" || name === "main";
			// Probe every candidate concurrently: the probes are independent
			// reads, so a repository with many branches costs one round instead
			// of two spawns per candidate.
			const probes = await Promise.all(others.map(async (candidate) => {
				const mergeBase = await runGit(this.ctx, toplevel, ["merge-base", candidate, source], signal);
				if (mergeBase.exitCode !== 0) return undefined;
				const distance = await runGit(this.ctx, toplevel, ["rev-list", "--count", `${mergeBase.stdout.trim()}..${candidate}`], signal);
				if (distance.exitCode !== 0) return undefined;
				const value = Number.parseInt(distance.stdout.trim(), 10);
				if (!Number.isFinite(value)) return undefined;
				return { candidate, distance: value };
			}));
			let best;
			let bestDistance = Number.POSITIVE_INFINITY;
			for (const probe of probes) {
				if (probe === undefined) continue;
				const wins = probe.distance < bestDistance
					|| (probe.distance === bestDistance && best !== undefined && isTrunk(probe.candidate) && !isTrunk(best));
				if (wins) {
					best = probe.candidate;
					bestDistance = probe.distance;
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

	/**
	 * List stash entries, newest first, with the files each one touches.
	 * @param request - Request object carrying the session identity.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns Stash rows with index, message, branch, and file paths.
	 */
	async stashList(request, signal) {
		const toplevel = await this.requireToplevelCached(request.sessionId, signal);
		const listing = await runGit(this.ctx, toplevel, [
			"stash",
			"list",
			"--format=%gd%x09%gs%x09%gx",
			"--date=iso"
		], signal);
		const lines = listing.stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0).slice(0, MAX_STASHES);
		// Every entry's file list is an independent read; fan them out in one
		// round instead of a serial show per stash.
		const shows = await Promise.all(lines.map((line) => {
			const ref = line.split("\t")[0].trim();
			return runGit(this.ctx, toplevel, ["stash", "show", "--name-only", "--include-untracked", ref], signal)
				.catch(() => ({ exitCode: 1, stdout: "", stderr: "" }));
		}));
		const rows = [];
		for (const [index, line] of lines.entries()) {
			const [ref, subject, stamp = ""] = line.split("\t");
			if (ref.trim().length === 0) continue;
			const files = shows[index];
			// %gs renders "On <branch>: <message>" (or the git default when the
			// user gave no message); split off the branch from the raw message.
			const onMatch = /^On\s+([^:]+):\s*(.*)$/u.exec(subject.trim());
			const message = (onMatch !== null ? onMatch[2] : subject).trim();
			const branch = onMatch !== null ? onMatch[1].trim() : undefined;
			rows.push({
				ref: ref.trim(),
				message,
				...(branch !== undefined && branch.length > 0 ? { branch } : {}),
				files: files.exitCode === 0
					? files.stdout.split(/\r?\n/u).map((name) => name.trim()).filter((name) => name.length > 0)
					: [],
				...(stamp.trim().length > 0 ? { date: stamp.trim() } : {})
			});
		}
		return { repository: true, stashes: rows };
	}

	/**
	 * Stash the checked subset of working-tree changes (or all of them) into a
	 * new stash entry, optionally including untracked files.
	 * @param request - Request object carrying the session identity, checked paths, an optional message, and the untracked flag.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The created stash reference and how many paths were stashed.
	 */
	async stash(request, signal) {
		const toplevel = await this.requireToplevel(request.sessionId, signal);
		const wanted = Array.isArray(request.files) ? request.files.filter((path) => typeof path === "string" && path.length > 0) : [];
		const includeUntracked = request.includeUntracked === true;
		if (wanted.length === 0 && includeUntracked !== true) {
			throw new RemoteError("branchSwitcher/nothing-stashed", "no changes are checked to stash", {});
		}
		let message = typeof request.message === "string" ? request.message.trim() : "";
		if (message.length === 0) message = "WIP";
		const head = await runGit(this.ctx, toplevel, ["rev-parse", "--abbrev-ref", "HEAD"], signal);
		const branch = head.exitCode === 0 ? head.stdout.trim() : "";
		let stashed = wanted.length;
		if (wanted.length > 0) {
			// Untracked paths carry no index entry, and `stash push` refuses
			// literal pathspecs for them; a real `git add` brings them under
			// git's view so the pathspec stash picks them up. This always runs
			// for checked untracked files — the user explicitly picked them.
			const statusOut = await runGit(this.ctx, toplevel, ["status", "--porcelain", "-z"], signal);
			const untracked = new Set();
			for (const entry of statusOut.stdout.split("\u0000")) {
				if (entry.length < 3 || !entry.startsWith("??")) continue;
				untracked.add(entry.slice(3));
			}
			const toAdd = wanted.filter((path) => untracked.has(path));
			if (toAdd.length > 0) {
				await runGit(this.ctx, toplevel, ["add", "--", ...toAdd.map((path) => `:(literal)${path}`)], signal);
			}
			const pathspecs = wanted.map((path) => `:(literal)${path}`);
			const pushed = await runGit(this.ctx, toplevel, [
				"stash",
				"push",
				...(includeUntracked ? ["--include-untracked"] : []),
				"-m",
				message,
				"--",
				...pathspecs
			], signal);
			if (pushed.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/stash-failed", gitMessage(pushed, "git stash failed"), {});
			}
			if (/(^|\n)No local changes to save/u.test(pushed.stdout)) {
				throw new RemoteError("branchSwitcher/nothing-stashed", "the checked paths have no changes to stash", {});
			}
		} else {
			const pushed = await runGit(this.ctx, toplevel, [
				"stash",
				"push",
				"--include-untracked",
				"-m",
				message
			], signal);
			if (pushed.exitCode !== 0) {
				throw new RemoteError("branchSwitcher/stash-failed", gitMessage(pushed, "git stash failed"), {});
			}
			const statusOut = await runGit(this.ctx, toplevel, ["status", "--porcelain"], signal);
			stashed = statusOut.exitCode === 0 ? countLines("") : 0;
		}
		const top = await runGit(this.ctx, toplevel, ["stash", "list", "--format=%gd"], signal);
		const ref = top.stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0) ?? "stash@{0}";
		this.invalidateStatus(toplevel);
		return {
			stashed: true,
			ref,
			paths: stashed,
			...(branch.length > 0 ? { branch } : {})
		};
	}

	/**
	 * Apply one stash entry back onto the working tree, optionally popping it
	 * (apply + drop) and optionally restoring the untracked files it saved.
	 * @param request - Request object carrying the session identity, the stash reference, and the pop/index flags.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns The applied reference, whether it was dropped, and the conflicted paths when the apply hit conflicts.
	 */
	async stashApply(request, signal) {
		const toplevel = await this.requireToplevel(request.sessionId, signal);
		const ref = typeof request.ref === "string" && /^stash@\{\d+\}$/u.test(request.ref) ? request.ref : "stash@{0}";
		const pop = request.pop === true;
		const dirty = await runGit(this.ctx, toplevel, ["status", "--porcelain"], signal);
		if (dirty.exitCode === 0 && countLines(dirty.stdout) > 0 && request.confirmed !== true) {
			return { requireConfirm: true, dirtyFiles: countLines(dirty.stdout) };
		}
		const args = pop ? ["stash", "pop"] : ["stash", "apply"];
		const applied = await runGit(this.ctx, toplevel, [...args, ref], signal);
		if (applied.exitCode !== 0) {
			const conflicts = await this.conflictedFiles(toplevel, signal);
			if (conflicts.length > 0) {
				return { applied: true, ref, popped: pop, conflicted: true, files: conflicts };
			}
			throw new RemoteError("branchSwitcher/apply-failed", gitMessage(applied, "git stash apply failed"), {});
		}
		this.invalidateStatus(toplevel);
		return { applied: true, ref, popped: pop };
	}

	/**
	 * Drop one stash entry (or every entry with all: true).
	 * @param request - Request object carrying the session identity, the stash reference, and the all flag.
	 * @param signal - Cancellation signal of the Remote call.
	 * @returns Whether the entry was dropped.
	 */
	async stashDrop(request, signal) {
		const toplevel = await this.requireToplevel(request.sessionId, signal);
		const args = request.all === true ? ["stash", "clear"] : ["stash", "drop"];
		if (request.all !== true) {
			const ref = typeof request.ref === "string" && /^stash@\{\d+\}$/u.test(request.ref) ? request.ref : "stash@{0}";
			args.push(ref);
		}
		const dropped = await runGit(this.ctx, toplevel, args, signal);
		if (dropped.exitCode !== 0) {
			throw new RemoteError("branchSwitcher/drop-failed", gitMessage(dropped, "git stash drop failed"), {});
		}
		return { dropped: true, all: request.all === true };
	}
}

markRemote(BranchSwitcherService.prototype, "status");
markRemote(BranchSwitcherService.prototype, "checkout");
markRemote(BranchSwitcherService.prototype, "fetch");
markRemote(BranchSwitcherService.prototype, "create");
markRemote(BranchSwitcherService.prototype, "changes");
markRemote(BranchSwitcherService.prototype, "snapshot");
markRemote(BranchSwitcherService.prototype, "diff");
markRemote(BranchSwitcherService.prototype, "push");
markRemote(BranchSwitcherService.prototype, "merge");
markRemote(BranchSwitcherService.prototype, "mergeAbort");
markRemote(BranchSwitcherService.prototype, "stashList");
markRemote(BranchSwitcherService.prototype, "stash");
markRemote(BranchSwitcherService.prototype, "stashApply");
markRemote(BranchSwitcherService.prototype, "stashDrop");
