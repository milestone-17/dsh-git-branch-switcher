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

	const switched = await service.checkout({ sessionId: "session-1", branch: "feature/second" });
	assert.equal(switched.switched, true, "switch reported");
	assert.equal(switched.current, "feature/second", "branch switched");
	const head = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repository }).toString().trim();
	assert.equal(head, "feature/second", "git HEAD moved");

	writeFileSync(join(repository, "dirty.txt"), "dirty\n");
	const dirty = await service.status({ sessionId: "session-1" });
	assert.equal(dirty.dirtyLines, 1, "dirty file counted");
	const guard = await service.checkout({ sessionId: "session-1", branch: "main" });
	assert.equal(guard.requireConfirm, true, "dirty tree asks for confirmation");
	assert.equal(guard.dirtyFiles, 1, "dirty file count reported");
	const confirmed = await service.checkout({ sessionId: "session-1", branch: "main", confirmed: true });
	assert.equal(confirmed.switched, true, "confirmed switch proceeds");

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

	const tracked = await service.checkout({ sessionId: "session-1", branch: "origin/feature/remote-only" });
	assert.equal(tracked.switched, true, "remote branch switch reported");
	assert.equal(tracked.current, "feature/remote-only", "local tracking branch created and checked out");
	const upstream = execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: repository }).toString().trim();
	assert.equal(upstream, "origin/feature/remote-only", "new branch tracks the remote branch");

	console.log("host smoke test: ok");
} finally {
	rmSync(repository, { recursive: true, force: true });
	rmSync(remote, { recursive: true, force: true });
}
