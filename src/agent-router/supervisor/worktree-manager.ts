import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";

export interface WorktreeCreateOptions {
  repoPath: string;
  worktreesDir: string;
  taskId: string;
  dryRun?: boolean;
}

export class WorktreeManager {
  createForTask(opts: WorktreeCreateOptions): string {
    const repoPath = resolve(opts.repoPath);
    const worktreesDir = resolve(repoPath, opts.worktreesDir);
    const branch = `agent-router/${opts.taskId}`;
    const worktreePath = resolve(worktreesDir, `${basename(repoPath)}-${opts.taskId}`);
    if (opts.dryRun) return worktreePath;

    mkdirSync(worktreesDir, { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", branch, worktreePath, "HEAD"], {
      cwd: repoPath,
      stdio: "pipe",
    });
    return worktreePath;
  }

  clean(worktreesDir: string, repoPath = process.cwd()): void {
    const target = resolve(repoPath, worktreesDir);
    rmSync(target, { recursive: true, force: true });
  }
}
