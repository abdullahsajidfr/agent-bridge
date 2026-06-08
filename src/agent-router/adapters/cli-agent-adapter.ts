import { existsSync } from "node:fs";
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentResult,
  AgentRole,
  AgentStatus,
  AgentTask,
  AgentType,
} from "../protocol/types";
import type { AgentRouterAgentConfig } from "../daemon/config";
import { DiffCollector } from "../supervisor/diff-collector";
import { LogStream } from "../supervisor/log-stream";
import { ProcessRunner } from "../supervisor/process-runner";

interface CliAgentAdapterOptions {
  id: string;
  type: AgentType;
  config: AgentRouterAgentConfig;
  dryRun?: boolean;
  runner?: ProcessRunner;
  diffCollector?: DiffCollector;
  logStream?: LogStream;
}

export class CliAgentAdapter implements AgentAdapter {
  readonly id: string;
  readonly type: AgentType;
  readonly role: AgentRole;
  readonly capabilities: AgentCapabilities;

  private readonly config: AgentRouterAgentConfig;
  private readonly dryRun: boolean;
  private readonly runner: ProcessRunner;
  private readonly diffCollector: DiffCollector;
  private readonly logStream: LogStream;
  private cancelledTaskIds = new Set<string>();

  constructor(opts: CliAgentAdapterOptions) {
    this.id = opts.id;
    this.type = opts.type;
    this.config = opts.config;
    this.role = opts.config.role;
    this.capabilities = {
      canEditFiles: opts.config.canEditFiles ?? true,
      canRunShell: opts.config.canRunShell ?? true,
      supportsStreaming: opts.config.supportsStreaming ?? false,
      supportsSessionResume: opts.config.supportsSessionResume ?? false,
      supportsStructuredOutput: opts.config.supportsStructuredOutput ?? false,
    };
    this.dryRun = opts.dryRun ?? false;
    this.runner = opts.runner ?? new ProcessRunner();
    this.diffCollector = opts.diffCollector ?? new DiffCollector();
    this.logStream = opts.logStream ?? new LogStream();
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async send(task: AgentTask): Promise<AgentResult> {
    if (this.cancelledTaskIds.has(task.id)) return this.cancelled(task);

    const cwd = task.worktreePath ?? task.repoPath;
    if (!this.dryRun && !existsSync(cwd)) {
      return this.failure(task, `Working directory does not exist: ${cwd}`);
    }

    const prompt = this.buildPrompt(task);
    const run = await this.runner.run({
      cwd,
      command: this.config.command,
      args: buildCommandArgs(this.config.args, prompt),
      timeoutMs: task.timeoutMs ?? 600000,
      dryRun: this.dryRun,
    });
    const rawLogPath = this.logStream.write(task.id, [
      `$ ${run.command}`,
      "",
      "STDOUT:",
      run.stdout,
      "",
      "STDERR:",
      run.stderr,
    ].join("\n"));
    const parsed = parseStructuredResult(run.stdout);
    const diffState = task.canEditFiles ? this.diffCollector.collect(cwd) : { changedFiles: [], diff: "" };
    const status = run.exitCode === 0 && !run.timedOut ? "success" : "failed";

    return {
      taskId: task.id,
      agentId: this.id,
      status: parsed?.status ?? status,
      summary: parsed?.summary ?? summarizeOutput(run.stdout, run.stderr, run.timedOut),
      changedFiles: parsed?.changedFiles?.length ? parsed.changedFiles : diffState.changedFiles,
      diff: parsed?.diff ?? diffState.diff,
      commandsRun: parsed?.commandsRun?.length ? parsed.commandsRun : [{
        command: run.command,
        exitCode: run.exitCode,
        stdout: truncate(run.stdout),
        stderr: truncate(run.stderr),
      }],
      testsRun: parsed?.testsRun ?? [],
      risks: parsed?.risks ?? (run.timedOut ? ["Task timed out before the adapter completed."] : []),
      questions: parsed?.questions ?? [],
      rawLogPath,
    };
  }

  async cancel(taskId: string): Promise<void> {
    this.cancelledTaskIds.add(taskId);
  }

  async status(): Promise<AgentStatus> {
    return {
      id: this.id,
      type: this.type,
      role: this.role,
      available: this.config.enabled,
      details: this.config.enabled ? `${this.config.command} ${this.config.args.join(" ")}`.trim() : "disabled in config",
    };
  }

  private buildPrompt(task: AgentTask): string {
    return [
      `You are the ${this.id} ${this.role} subagent in AgentRouter.`,
      `Task id: ${task.id}`,
      `Room id: ${task.roomId}`,
      `Objective: ${task.objective}`,
      "",
      "Instructions:",
      task.instructions,
      "",
      `Expected output: ${task.expectedOutput}`,
      `Can edit files: ${task.canEditFiles}`,
      `Can run commands: ${task.canRunCommands}`,
      task.constraints.length ? `Constraints:\n${task.constraints.map((item) => `- ${item}`).join("\n")}` : "Constraints: none",
      task.allowedFiles?.length ? `Allowed files:\n${task.allowedFiles.map((item) => `- ${item}`).join("\n")}` : "",
      task.disallowedFiles?.length ? `Disallowed files:\n${task.disallowedFiles.map((item) => `- ${item}`).join("\n")}` : "",
      "",
      "Return a JSON object with this shape:",
      JSON.stringify({
        status: "success | failed | partial | cancelled",
        summary: "brief result",
        changedFiles: ["path"],
        diff: "optional unified diff",
        commandsRun: [{ command: "string", exitCode: 0, stdout: "optional", stderr: "optional" }],
        testsRun: [{ command: "string", passed: true, output: "optional" }],
        risks: ["risk"],
        questions: ["question"],
      }, null, 2),
    ].filter(Boolean).join("\n");
  }

  private cancelled(task: AgentTask): AgentResult {
    return {
      taskId: task.id,
      agentId: this.id,
      status: "cancelled",
      summary: "Task was cancelled before execution.",
      changedFiles: [],
      commandsRun: [],
      testsRun: [],
      risks: [],
      questions: [],
    };
  }

  private failure(task: AgentTask, summary: string): AgentResult {
    return {
      taskId: task.id,
      agentId: this.id,
      status: "failed",
      summary,
      changedFiles: [],
      commandsRun: [],
      testsRun: [],
      risks: [summary],
      questions: [],
    };
  }
}

function parseStructuredResult(stdout: string): Partial<AgentResult> | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1),
  ].filter((item) => item.startsWith("{") && item.endsWith("}"));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isStructuredAgentResult(parsed)) return parsed;
    } catch {}
  }
  return null;
}

export function buildCommandArgs(args: string[], prompt: string): string[] {
  if (!args.some((arg) => arg.includes("{prompt}"))) return [...args, prompt];
  return args.map((arg) => arg.replaceAll("{prompt}", prompt));
}

function isStructuredAgentResult(value: unknown): value is Partial<AgentResult> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = (value as { status?: unknown }).status;
  return status === "success" || status === "failed" || status === "partial" || status === "cancelled";
}

function summarizeOutput(stdout: string, stderr: string, timedOut: boolean): string {
  if (timedOut) return "Adapter command timed out.";
  const content = stdout.trim() || stderr.trim();
  return content ? truncate(content, 1000) : "Adapter command completed with no output.";
}

function truncate(value: string, limit = 4000): string {
  return value.length > limit ? `${value.slice(0, limit)}\n[truncated]` : value;
}
