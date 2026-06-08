import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../agent-router/daemon/registry";
import { AgentRouter, plannerPrompt, plannerText } from "../agent-router/daemon/router";
import { DEFAULT_AGENT_ROUTER_CONFIG, type AgentRouterConfig } from "../agent-router/daemon/config";
import { parseAgentPlan } from "../agent-router/daemon/plan-parser";
import type { AgentAdapter, AgentResult, AgentStatus, AgentTask } from "../agent-router/protocol/types";

class MockAdapter implements AgentAdapter {
  readonly type: AgentAdapter["type"];
  readonly role: AgentAdapter["role"];
  capabilities = {
    canEditFiles: false,
    canRunShell: true,
    supportsStreaming: false,
    supportsSessionResume: false,
    supportsStructuredOutput: true,
  };
  sentTasks: AgentTask[] = [];

  constructor(
    readonly id = "gemini",
    type: AgentAdapter["type"] = "gemini",
    role: AgentAdapter["role"] = "implementer",
    private readonly summary = "mocked",
  ) {
    this.type = type;
    this.role = role;
  }

  async start() {}
  async stop() {}
  async cancel() {}
  async status(): Promise<AgentStatus> {
    return { id: this.id, type: this.type, role: this.role, available: true };
  }
  async send(task: AgentTask): Promise<AgentResult> {
    this.sentTasks.push(task);
    return {
      taskId: task.id,
      agentId: this.id,
      status: "success",
      summary: this.summary,
      changedFiles: [],
      commandsRun: [],
      testsRun: [],
      risks: [],
      questions: [],
    };
  }
}

describe("AgentRouter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-router-router-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("dispatches a task through the registry and records the result", async () => {
    const adapter = new MockAdapter();
    const registry = new AgentRegistry();
    registry.register(adapter);
    const config: AgentRouterConfig = {
      ...structuredClone(DEFAULT_AGENT_ROUTER_CONFIG),
      repoPath: tempDir,
      dryRun: true,
    };
    const router = new AgentRouter(config, registry);

    const result = await router.assign({
      to: "gemini",
      objective: "Write tests",
      canEditFiles: false,
    });

    expect(result.summary).toBe("mocked");
    expect(adapter.sentTasks[0].from).toBe("codex");
    expect(router.tasks.get(result.taskId)?.status).toBe("success");
    expect(router.rooms.list()).toHaveLength(1);
  });

  test("runs a planner task and dispatches every parsed subtask", async () => {
    const planner = new MockAdapter(
      "codex",
      "codex",
      "planner",
      JSON.stringify({
        summary: "Two task plan",
        tasks: [
          { to: "gemini", objective: "Implement parser", expectedOutput: "patch", canEditFiles: false },
          { to: "copilot", objective: "Review parser", expectedOutput: "review", canEditFiles: false },
        ],
      }),
    );
    const gemini = new MockAdapter("gemini", "gemini", "implementer", "implemented");
    const copilot = new MockAdapter("copilot", "copilot", "reviewer", "reviewed");
    const registry = new AgentRegistry();
    registry.register(planner);
    registry.register(gemini);
    registry.register(copilot);
    const config: AgentRouterConfig = {
      ...structuredClone(DEFAULT_AGENT_ROUTER_CONFIG),
      repoPath: tempDir,
      dryRun: true,
    };
    const router = new AgentRouter(config, registry);

    const result = await router.runPlanAndDispatch("codex", "Build parser", true);

    expect(result.status).toBe("success");
    expect(result.plan.tasks).toHaveLength(2);
    expect(result.subtaskResults.map((item) => item.agentId)).toEqual(["gemini", "copilot"]);
    expect(gemini.sentTasks[0].roomId).toBe(planner.sentTasks[0].roomId);
    expect(copilot.sentTasks[0].roomId).toBe(planner.sentTasks[0].roomId);
  });

  test("extracts full planner stdout from raw logs before parsing", () => {
    const logPath = join(tempDir, "planner.log");
    const plan = {
      summary: "Long JSONL output plan",
      tasks: [{ to: "gemini", objective: "Implement UI", expectedOutput: "patch", canEditFiles: true }],
    };
    writeFileSync(logPath, [
      "$ codex exec --json",
      "",
      "STDOUT:",
      "noise ".repeat(1000),
      JSON.stringify({ type: "agent_message", text: JSON.stringify(plan) }),
      "",
      "STDERR:",
      "",
    ].join("\n"));

    const text = plannerText({
      taskId: "task_1",
      agentId: "codex",
      status: "success",
      summary: "truncated output without the actual plan",
      changedFiles: [],
      commandsRun: [{ command: "codex exec", stdout: "also truncated" }],
      testsRun: [],
      risks: [],
      questions: [],
      rawLogPath: logPath,
    });

    expect(parseAgentPlan(text).tasks[0].objective).toBe("Implement UI");
  });

  test("planner prompt constrains assignments to enabled subagents", () => {
    const prompt = plannerPrompt("Improve network UI", [new MockAdapter("gemini"), new MockAdapter("copilot", "copilot", "reviewer")]);

    expect(prompt).toContain("Use only the enabled subagent ids listed below");
    expect(prompt).toContain("- gemini:");
    expect(prompt).toContain("- copilot:");
    expect(prompt).not.toContain("- cursor:");
  });
});
