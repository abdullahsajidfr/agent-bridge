import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliAgentAdapter, buildCommandArgs } from "../agent-router/adapters/cli-agent-adapter";
import type { ProcessRunOptions, ProcessRunResult } from "../agent-router/supervisor/process-runner";
import type { AgentTask } from "../agent-router/protocol/types";

class MockRunner {
  async run(opts: ProcessRunOptions): Promise<ProcessRunResult> {
    return {
      command: [opts.command, ...opts.args].join(" "),
      exitCode: 0,
      stdout: JSON.stringify({
        status: "success",
        summary: "structured ok",
        changedFiles: ["src/example.ts"],
        commandsRun: [{ command: "bun test", exitCode: 0 }],
        testsRun: [{ command: "bun test", passed: true }],
        risks: [],
        questions: [],
      }),
      stderr: "",
      timedOut: false,
    };
  }
}

class SchemaEchoRunner {
  async run(opts: ProcessRunOptions): Promise<ProcessRunResult> {
    return {
      command: [opts.command, ...opts.args].join(" "),
      exitCode: 0,
      stdout: JSON.stringify({
        status: "success | failed | partial | cancelled",
        summary: "brief result",
      }),
      stderr: "",
      timedOut: false,
    };
  }
}

class PromptCaptureRunner {
  prompts: string[] = [];

  async run(opts: ProcessRunOptions): Promise<ProcessRunResult> {
    this.prompts.push(opts.args.at(-1) ?? "");
    return {
      command: [opts.command, ...opts.args].join(" "),
      exitCode: 0,
      stdout: JSON.stringify({ summary: "plan", tasks: [] }),
      stderr: "",
      timedOut: false,
    };
  }
}

describe("CliAgentAdapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-router-cli-adapter-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("parses structured subagent output", async () => {
    const adapter = new CliAgentAdapter({
      id: "gemini",
      type: "gemini",
      config: {
        enabled: true,
        command: "mock-agent",
        args: ["-p"],
        role: "implementer",
      },
      runner: new MockRunner() as any,
    });
    const task: AgentTask = {
      id: "task_1",
      roomId: "room_1",
      from: "codex",
      to: "gemini",
      repoPath: tempDir,
      objective: "Do work",
      instructions: "Do work",
      constraints: [],
      canEditFiles: false,
      canRunCommands: true,
      expectedOutput: "answer",
    };

    const result = await adapter.send(task);

    expect(result.status).toBe("success");
    expect(result.summary).toBe("structured ok");
    expect(result.changedFiles).toEqual(["src/example.ts"]);
    expect(result.testsRun[0].passed).toBe(true);
  });

  test("ignores schema examples that are not real result statuses", async () => {
    const adapter = new CliAgentAdapter({
      id: "gemini",
      type: "gemini",
      config: {
        enabled: true,
        command: "mock-agent",
        args: ["-p"],
        role: "implementer",
      },
      runner: new SchemaEchoRunner() as any,
    });
    const task: AgentTask = {
      id: "task_2",
      roomId: "room_1",
      from: "codex",
      to: "gemini",
      repoPath: tempDir,
      objective: "Do work",
      instructions: "Do work",
      constraints: [],
      canEditFiles: false,
      canRunCommands: true,
      expectedOutput: "answer",
    };

    const result = await adapter.send(task);

    expect(result.status).toBe("success");
    expect(result.summary).toContain("success | failed | partial | cancelled");
  });

  test("does not append the generic result schema to planner prompts", async () => {
    const runner = new PromptCaptureRunner();
    const adapter = new CliAgentAdapter({
      id: "codex",
      type: "codex",
      config: {
        enabled: true,
        command: "mock-agent",
        args: ["exec", "--json"],
        role: "planner",
      },
      runner: runner as any,
    });
    const task: AgentTask = {
      id: "task_3",
      roomId: "room_1",
      from: "codex",
      to: "codex",
      repoPath: tempDir,
      objective: "Plan work",
      instructions: "Return only JSON with a tasks array.",
      constraints: [],
      canEditFiles: false,
      canRunCommands: true,
      expectedOutput: "answer",
    };

    await adapter.send(task);

    expect(runner.prompts[0]).toContain("Return only JSON with a tasks array.");
    expect(runner.prompts[0]).not.toContain("Return a JSON object with this shape:");
    expect(runner.prompts[0]).not.toContain("success | failed | partial | cancelled");
  });

  test("buildCommandArgs appends prompt when no template is configured", () => {
    expect(buildCommandArgs(["exec", "--json"], "hello")).toEqual(["exec", "--json", "hello"]);
  });

  test("buildCommandArgs replaces prompt templates", () => {
    expect(buildCommandArgs(["--prompt={prompt}", "--format", "json"], "hello")).toEqual([
      "--prompt=hello",
      "--format",
      "json",
    ]);
  });
});
