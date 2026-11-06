/**
 * Host-half smoke test: drives BranchSwitcherService against a throwaway git
 * repository with a stubbed harness context.
 *
 * Run: node tests/host-smoke.test.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import BranchSwitcherService from "../index.js";

/** Minimal harness subprocess seam: no shell, collected stdio, bounded output. */
const subprocess = {
	async resolveExecutable(command) {
		return command;
	},
	spawn(spec) {
		const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, shell: false });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		const done = new Promise((resolve) => {
			child.on("close", (code) => resolve({ exitCode: code ?? 0 }));
		});
		return {
			done,
			collected: {
				stdout: { readFrom: () => ({ text: stdout }) },
				stderr: { readFrom: () => ({ text: stderr }) }
			}
		};
	}
};

/** Build a repository with two branches and one uncommitted file. */
function createRepository() {
	const dir = mkdtempSync(join(tmpdir(), "gbs-host-smoke-"));
	const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
	git("init", "-b", "main");
	git("config", "user.email", "smoke@example.com");
	git("config", "user.name", "smoke");
	writeFileSync(join(dir, "a.txt"), "one\n");
	git("add", "-A");
	git("commit", "-m", "init");
	git("checkout", "-b", "feature/second");
	writeFileSync(join(dir, "b.txt"), "two\n");
	git("add", "-A");
	git("commit", "-m", "second");
	git("checkout", "main");
	return dir;
}

/** Build a bare repository that plays the role of the upstream remote. */
function createRemote() {
	const dir = mkdtempSync(join(tmpdir(), "gbs-host-remote-"));
	execFileSync("git", ["init", "--bare", "-b", "main", dir], { stdio: "ignore" });
	return dir;
}

const repository = createRepository();
const remote = createRemote();
try {
	const ctx = {
		reflect: { provide() {} },
		subprocess,
		sessionController: {
			async resolveAgent(sessionId) {
				return { agent: { session: { id: sessionId } } };
			}
		},
		workingDirectory: {
			defaultDirectory: repository,
			get() {
				return repository;
			}
		}
	};
	const service = new BranchSwitcherService(ctx, {});
	const status = await service.status({ sessionId: "session-1" });
	assert.equal(status.repository, true, "repository detected");
	assert.equal(status.current, "main", "current branch reported");
	assert.equal(status.detached, false, "HEAD is attached");
	assert.ok(status.branches.some((branch) => branch.name === "feature/second"), "second branch listed");
	assert.ok(status.branches.some((branch) => branch.name === "main" && branch.current === true), "current marker set");
	assert.equal(status.dirtyLines, 0, "clean tree reported");

	// --- combined ref parse: cache serves repeats within the TTL ---
	const cachedAgain = await service.status({ sessionId: "session-1" });
	assert.equal(cachedAgain, status, "repeat status within the TTL comes from the cache");

	const switched = await service.checkout({ sessionId: "session-1", branch: "feature/second" });
	assert.equal(switched.switched, true, "switch reported");
	assert.equal(switched.current, "feature/second", "branch switched");
	const head = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repository }).toString().trim();
	assert.equal(head, "feature/second", "git HEAD moved");

	writeFileSync(join(repository, "dirty.txt"), "dirty\n");
	service.invalidateStatus(repository);
	const dirty = await service.status({ sessionId: "session-1" });
	assert.equal(dirty.dirtyLines, 1, "dirty file counted");
	const guard = await service.checkout({ sessionId: "session-1", branch: "main" });
	assert.equal(guard.requireConfirm, true, "dirty tree asks for confirmation");
	assert.equal(guard.dirtyFiles, 1, "dirty file count reported");
	const confirmed = await service.checkout({ sessionId: "session-1", branch: "main", confirmed: true });
	assert.equal(confirmed.switched, true, "confirmed switch proceeds");

	const createGuard = await service.create({ sessionId: "session-1", name: "feature/created", base: "main" });
	assert.equal(createGuard.requireConfirm, true, "creating on a dirty tree asks for confirmation");
	assert.equal(createGuard.dirtyFiles, 1, "dirty file count reported for the create guard");
	const created = await service.create({ sessionId: "session-1", name: "feature/created", base: "main", confirmed: true });
	assert.equal(created.created, true, "create reported");
	assert.equal(created.createdBranch, "feature/created", "created branch name reported");
	assert.equal(created.current, "feature/created", "the session sits on the new branch right away");
	const createdHead = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repository }).toString().trim();
	assert.equal(createdHead, "feature/created", "git HEAD moved onto the new branch");

	await assert.rejects(
		() => service.create({ sessionId: "session-1", name: "feature/created", base: "main" }),
		(error) => error?.code === "branchSwitcher/branch-exists",
		"an already existing branch name is rejected"
	);
	await assert.rejects(
		() => service.create({ sessionId: "session-1", name: "feature/other", base: "no-such-branch" }),
		(error) => error?.code === "branchSwitcher/base-missing",
		"an unknown base branch is rejected"
	);
	await assert.rejects(
		() => service.create({ sessionId: "session-1", name: "--force", base: "main" }),
		(error) => error?.code === "branchSwitcher/invalid-branch",
		"option-like branch names are rejected on create"
	);

	await assert.rejects(
		() => service.checkout({ sessionId: "session-1", branch: "--force" }),
		(error) => error?.code === "branchSwitcher/invalid-branch",
		"option-like branch names are rejected"
	);

	rmSync(join(repository, "dirty.txt"), { force: true });
	execFileSync("git", ["remote", "add", "origin", remote], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["push", "-u", "origin", "main"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["checkout", "-b", "feature/remote-only"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["push", "origin", "feature/remote-only"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["checkout", "main"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["branch", "-D", "feature/remote-only"], { cwd: repository, stdio: "ignore" });

	const fetched = await service.fetch({ sessionId: "session-1" });
	assert.equal(fetched.fetched, true, "fetch reported");
	assert.equal(fetched.repository, true, "repository still detected after fetch");
	const remoteRow = (fetched.remoteBranches ?? []).find((ref) => ref.name === "origin/feature/remote-only");
	assert.ok(remoteRow !== void 0, "remote-tracking branch listed after fetch");
	assert.equal(remoteRow.short, "feature/remote-only", "remote short name reported");
	assert.equal(remoteRow.local, false, "remote-only branch marked as not local");
	const localRow = (fetched.remoteBranches ?? []).find((ref) => ref.name === "origin/main");
	assert.equal(localRow?.local, true, "remote branch with a local counterpart is marked");
	assert.ok((fetched.remoteBranches ?? []).every((ref) => ref.short !== "HEAD"), "symbolic remote HEAD excluded from rows");

	const tracked = await service.checkout({ sessionId: "session-1", branch: "origin/feature/remote-only" });
	assert.equal(tracked.switched, true, "remote branch switch reported");
	assert.equal(tracked.current, "feature/remote-only", "local tracking branch created and checked out");
	const upstream = execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: repository }).toString().trim();
	assert.equal(upstream, "origin/feature/remote-only", "new branch tracks the remote branch");

	const fromRemote = await service.create({ sessionId: "session-1", name: "feature/from-remote", base: "origin/feature/remote-only" });
	assert.equal(fromRemote.created, true, "creating from a remote-tracking base works");
	assert.equal(fromRemote.current, "feature/from-remote", "the session switched onto the branch created from a remote base");

	// --- changes: typed listing with spaces and Chinese paths, unpushed count ---
	execFileSync("git", ["checkout", "main"], { cwd: repository, stdio: "ignore" });
	writeFileSync(join(repository, "with space.txt"), "space\n");
	writeFileSync(join(repository, "中文路径.md"), "cjk\n");
	writeFileSync(join(repository, "tracked.txt"), "changed\n");
	execFileSync("git", ["add", "tracked.txt"], { cwd: repository, stdio: "ignore" });
	const listed = await service.changes({ sessionId: "session-1" });
	assert.equal(listed.repository, true, "changes reports repository");
	assert.equal(listed.current, "main", "changes reports the current branch");
	const spaceRow = listed.files.find((row) => row.path === "with space.txt");
	assert.ok(spaceRow !== void 0, "path with a space listed");
	assert.equal(spaceRow.kind, "untracked", "untracked kind labeled");
	const cjkRow = listed.files.find((row) => row.path === "中文路径.md");
	assert.ok(cjkRow !== void 0, "Chinese path listed");
	const trackedRow = listed.files.find((row) => row.path === "tracked.txt");
	assert.equal(trackedRow?.kind, "added", "staged new content labeled added");
	assert.equal(listed.unpushedCount, 0, "main is pushed so the unpushed count is zero");
	assert.ok(Array.isArray(listed.remotes) && listed.remotes.includes("origin"), "remotes listed");
	assert.equal(listed.merging, false, "no merge in progress");
	execFileSync("git", ["checkout", "--", "tracked.txt"], { cwd: repository, stdio: "ignore" });
	rmSync(join(repository, "with space.txt"), { force: true });
	rmSync(join(repository, "中文路径.md"), { force: true });
	service.invalidateStatus(repository);

	// --- changes: inferred merge target via dsh-base fallbacks ---
	const inferred = await service.changes({ sessionId: "session-1", inferTargetFor: "feature/second" });
	assert.equal(inferred.inferredTarget, "main", "merge target inferred from the recorded pull source");

	// --- push: no remote repository errors first ---
	const noRemoteRepo = createRepository();
	const noRemoteCtx = {
		...ctx,
		workingDirectory: { defaultDirectory: noRemoteRepo, get: () => noRemoteRepo }
	};
	const noRemoteService = new BranchSwitcherService(noRemoteCtx, {});
	writeFileSync(join(noRemoteRepo, "pending.txt"), "pending\n");
	await assert.rejects(
		() => noRemoteService.push({ sessionId: "s", files: ["pending.txt"], message: "m" }),
		(error) => error?.code === "branchSwitcher/no-remote",
		"push without a remote is rejected"
	);
	rmSync(noRemoteRepo, { recursive: true, force: true });

	// --- push: checked subset commits only those files and establishes upstream ---
	execFileSync("git", ["checkout", "main"], { cwd: repository, stdio: "ignore" });
	writeFileSync(join(repository, "pick-me.txt"), "pick\n");
	writeFileSync(join(repository, "leave-me.txt"), "leave\n");
	const pushed = await service.push({
		sessionId: "session-1",
		files: ["pick-me.txt"],
		message: "feat: pick one file"
	});
	assert.equal(pushed.pushed, true, "push reported");
	assert.equal(pushed.branch, "main", "pushed branch reported");
	assert.equal(pushed.upstream, "origin/main", "upstream established");
	const committedFiles = execFileSync("git", ["show", "--name-only", "--format=", "HEAD"], { cwd: repository }).toString().trim().split(/\r?\n/u);
	assert.ok(committedFiles.includes("pick-me.txt"), "checked file committed");
	assert.ok(!committedFiles.includes("leave-me.txt"), "unchecked file left out of the commit");
	const leftBehind = await service.changes({ sessionId: "session-1" });
	assert.ok(leftBehind.files.some((row) => row.path === "leave-me.txt"), "unchecked file still pending");
	const unpushedAfter = leftBehind.unpushedCount;
	assert.equal(unpushedAfter, 0, "everything pushed so nothing is unpushed");
	await assert.rejects(
		() => service.push({ sessionId: "session-1", files: [], pushAll: false, message: "x" }),
		(error) => error?.code === "branchSwitcher/nothing-staged",
		"push without checked files or pending commits is rejected"
	);

	// --- push: clean tree one-shot push of existing commits ---
	execFileSync("git", ["checkout", "feature/second"], { cwd: repository, stdio: "ignore" });
	const cleanPush = await service.push({ sessionId: "session-1", files: [], pushAll: true });
	assert.equal(cleanPush.pushed, true, "clean push reported");
	assert.equal(cleanPush.branch, "feature/second", "feature branch pushed");
	assert.equal(cleanPush.upstream, "origin/feature/second", "feature upstream established");

	// --- merge: fast-forward with branch restore + same-branch guard ---
	rmSync(join(repository, "leave-me.txt"), { force: true });
	execFileSync("git", ["checkout", "main"], { cwd: repository, stdio: "ignore" });
	await assert.rejects(
		() => service.merge({ sessionId: "session-1", source: "main", target: "main" }),
		(error) => error?.code === "branchSwitcher/invalid-merge",
		"merging a branch into itself is rejected"
	);
	const ffBranch = await service.create({ sessionId: "session-1", name: "feature/ff", base: "main", confirmed: true });
	assert.equal(ffBranch.created, true, "fast-forward source branch created");
	writeFileSync(join(repository, "ff.txt"), "ff\n");
	execFileSync("git", ["add", "-A"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["commit", "-m", "ff commit"], { cwd: repository, stdio: "ignore" });
	const ff = await service.merge({ sessionId: "session-1", source: "feature/ff", target: "main" });
	assert.equal(ff.merged, true, "merge reported");
	assert.equal(ff.mode, "fast-forward", "fast-forward mode detected");
	assert.equal(ff.restoredTo, "feature/ff", "session restored to the branch it started on");
	const mainSha = execFileSync("git", ["rev-parse", "main"], { cwd: repository }).toString().trim();
	const ffSha = execFileSync("git", ["rev-parse", "feature/ff"], { cwd: repository }).toString().trim();
	assert.equal(mainSha, ffSha, "fast-forward moved main onto the source commit");

	// --- merge: true merge stays put then restores; up-to-date detection ---
	execFileSync("git", ["checkout", "feature/from-remote"], { cwd: repository, stdio: "ignore" });
	writeFileSync(join(repository, "diverge.txt"), "diverge\n");
	execFileSync("git", ["add", "-A"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["commit", "-m", "diverge"], { cwd: repository, stdio: "ignore" });
	const trueMerge = await service.merge({ sessionId: "session-1", source: "feature/from-remote", target: "main" });
	assert.equal(trueMerge.merged, true, "true merge reported");
	assert.equal(trueMerge.mode, "true", "merge mode labeled as a true merge");
	assert.equal(trueMerge.restoredTo, "feature/from-remote", "session restored to the original branch");
	const upToDate = await service.merge({ sessionId: "session-1", source: "feature/from-remote", target: "main" });
	assert.equal(upToDate.merged, true, "up-to-date merge reported");
	assert.equal(upToDate.mode, "up-to-date", "up-to-date mode detected");

	// --- merge: conflict lists files, abort restores the pre-merge state ---
	execFileSync("git", ["checkout", "main"], { cwd: repository, stdio: "ignore" });
	writeFileSync(join(repository, "a.txt"), "main-side\n");
	execFileSync("git", ["add", "-A"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["commit", "-m", "main-side"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["checkout", "feature/second"], { cwd: repository, stdio: "ignore" });
	writeFileSync(join(repository, "a.txt"), "feature-side\n");
	execFileSync("git", ["add", "-A"], { cwd: repository, stdio: "ignore" });
	execFileSync("git", ["commit", "-m", "feature-side"], { cwd: repository, stdio: "ignore" });
	service.invalidateStatus(repository);
	const conflict = await service.merge({ sessionId: "session-1", source: "main", target: "feature/second" });
	assert.equal(conflict.conflicted, true, "conflict reported");
	assert.ok(conflict.files.includes("a.txt"), "conflicting file listed");
	const midMerge = await service.changes({ sessionId: "session-1" });
	assert.equal(midMerge.merging, true, "changes reports the merge in progress");
	assert.deepEqual(midMerge.conflictFiles, ["a.txt"], "conflict files surfaced by changes");
	const aborted = await service.mergeAbort({ sessionId: "session-1" });
	assert.equal(aborted.aborted, true, "abort reported");
	const afterAbort = await service.changes({ sessionId: "session-1" });
	assert.equal(afterAbort.merging, false, "no merge left in progress after abort");
	await assert.rejects(
		() => service.mergeAbort({ sessionId: "session-1" }),
		(error) => error?.code === "branchSwitcher/not-merging",
		"aborting without a merge in progress is rejected"
	);

	// --- create records the pull source for later merge inference ---
	const based = await service.create({ sessionId: "session-1", name: "feature/based", base: "main", confirmed: true });
	assert.equal(based.created, true, "branch created for the base recording check");
	const recorded = execFileSync("git", ["config", "--get", "branch.feature/based.dsh-base"], { cwd: repository }).toString().trim();
	assert.equal(recorded, "main", "pull source recorded in local config");

	console.log("host smoke test: ok");
} finally {
	rmSync(repository, { recursive: true, force: true });
	rmSync(remote, { recursive: true, force: true });
}
