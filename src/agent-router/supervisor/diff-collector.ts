import { execFileSync } from "node:child_process";

export class DiffCollector {
  collect(repoPath: string): { changedFiles: string[]; diff: string } {
    const changedFiles = this.runGit(repoPath, ["status", "--porcelain", "--untracked-files=all"])
      .split("\n")
      .map((line) => parseStatusPath(line))
      .filter(Boolean);
    const diff = [
      this.runGit(repoPath, ["diff", "--no-ext-diff"]),
      this.untrackedSummary(repoPath),
    ].filter(Boolean).join("\n");
    return { changedFiles, diff };
  }

  private runGit(cwd: string, args: string[]): string {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf-8" });
    } catch {
      return "";
    }
  }

  private untrackedSummary(cwd: string): string {
    const untracked = this.runGit(cwd, ["ls-files", "--others", "--exclude-standard"])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!untracked.length) return "";
    return [
      "Untracked files:",
      ...untracked.map((file) => `- ${file}`),
    ].join("\n");
  }
}

function parseStatusPath(line: string): string {
  if (!line.trim()) return "";
  const path = line.slice(3).trim();
  const renameSeparator = " -> ";
  return path.includes(renameSeparator) ? path.split(renameSeparator).at(-1) ?? path : path;
}
