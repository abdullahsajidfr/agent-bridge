import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorktreeManager } from "../agent-router/supervisor/worktree-manager";

describe("WorktreeManager", () => {
  let tempDir: string;
  let repoPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-router-worktree-"));
    repoPath = join(tempDir, "repo");
    execFileSync("git", ["init", repoPath]);
    execFileSync("git", ["config", "user.email", "agent-router@example.com"], { cwd: repoPath });
    execFileSync("git", ["config", "user.name", "Agent Router"], { cwd: repoPath });
    writeFileSync(join(repoPath, "README.md"), "# Test\n", "utf-8");
    execFileSync("git", ["add", "README.md"], { cwd: repoPath });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: repoPath });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("creates and cleans task worktrees", () => {
    const manager = new WorktreeManager();
    const worktreePath = manager.createForTask({
      repoPath,
      worktreesDir: "../worktrees",
      taskId: "task_1",
    });

    expect(existsSync(worktreePath)).toBe(true);
    expect(existsSync(join(worktreePath, "README.md"))).toBe(true);

    execFileSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoPath });
    manager.clean("../worktrees", repoPath);
    expect(existsSync(join(tempDir, "worktrees"))).toBe(false);
  });
});
