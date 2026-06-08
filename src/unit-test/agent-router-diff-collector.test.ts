import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiffCollector } from "../agent-router/supervisor/diff-collector";

describe("DiffCollector", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "agent-router-diff-"));
    execFileSync("git", ["init"], { cwd: repoPath });
    execFileSync("git", ["config", "user.email", "agent-router@example.com"], { cwd: repoPath });
    execFileSync("git", ["config", "user.name", "Agent Router"], { cwd: repoPath });
    writeFileSync(join(repoPath, "tracked.txt"), "one\n", "utf-8");
    execFileSync("git", ["add", "tracked.txt"], { cwd: repoPath });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: repoPath });
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  test("collects tracked and untracked changes", () => {
    writeFileSync(join(repoPath, "tracked.txt"), "two\n", "utf-8");
    writeFileSync(join(repoPath, "new.txt"), "new\n", "utf-8");

    const collected = new DiffCollector().collect(repoPath);

    expect(collected.changedFiles).toContain("tracked.txt");
    expect(collected.changedFiles).toContain("new.txt");
    expect(collected.diff).toContain("diff --git");
    expect(collected.diff).toContain("Untracked files:");
    expect(collected.diff).toContain("- new.txt");
  });
});
