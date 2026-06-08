import { spawn, type ChildProcess } from "node:child_process";

export interface ProcessRunOptions {
  cwd: string;
  command: string;
  args: string[];
  input?: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
}

export interface ProcessRunResult {
  command: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export class ProcessRunner {
  async run(opts: ProcessRunOptions): Promise<ProcessRunResult> {
    const printable = [opts.command, ...opts.args].join(" ");
    if (opts.dryRun) {
      return {
        command: printable,
        exitCode: 0,
        stdout: `[dry-run] ${printable}`,
        stderr: "",
        timedOut: false,
      };
    }

    return await new Promise<ProcessRunResult>((resolve) => {
      let proc: ChildProcess;
      try {
        proc = spawn(opts.command, opts.args, {
          cwd: opts.cwd,
          env: { ...process.env, ...opts.env },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err: any) {
        resolve({
          command: printable,
          exitCode: 127,
          stdout: "",
          stderr: err?.message ?? String(err),
          timedOut: false,
        });
        return;
      }

      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        proc.kill("SIGTERM");
        setTimeout(() => {
          try { proc.kill("SIGKILL"); } catch {}
        }, 1000);
      }, opts.timeoutMs);

      proc.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proc.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ command: printable, exitCode: 127, stdout, stderr: stderr + err.message, timedOut: false });
      });
      proc.on("exit", (code, signal) => {
        if (settled) return;
        settled = true;
        const timedOut = signal === "SIGTERM" || signal === "SIGKILL";
        clearTimeout(timer);
        resolve({ command: printable, exitCode: code ?? undefined, stdout, stderr, timedOut });
      });

      if (opts.input) proc.stdin?.write(opts.input);
      proc.stdin?.end();
    });
  }
}
