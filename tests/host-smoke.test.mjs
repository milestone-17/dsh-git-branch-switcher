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

const repository = createRepository();
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

	console.log("host smoke test: ok");
} finally {
	rmSync(repository, { recursive: true, force: true });
}
