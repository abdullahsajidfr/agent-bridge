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
