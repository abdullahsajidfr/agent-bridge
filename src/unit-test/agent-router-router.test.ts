import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../agent-router/daemon/registry";
import { AgentRouter } from "../agent-router/daemon/router";
import { DEFAULT_AGENT_ROUTER_CONFIG, type AgentRouterConfig } from "../agent-router/daemon/config";
import type { AgentAdapter, AgentResult, AgentStatus, AgentTask } from "../agent-router/protocol/types";

class MockAdapter implements AgentAdapter {
  id = "gemini";
  type = "gemini" as const;
  role = "implementer" as const;
  capabilities = {
    canEditFiles: false,
    canRunShell: true,
    supportsStreaming: false,
    supportsSessionResume: false,
    supportsStructuredOutput: true,
  };
  sentTask: AgentTask | null = null;

  async start() {}
  async stop() {}
  async cancel() {}
  async status(): Promise<AgentStatus> {
    return { id: this.id, type: this.type, role: this.role, available: true };
  }
  async send(task: AgentTask): Promise<AgentResult> {
    this.sentTask = task;
    return {
      taskId: task.id,
      agentId: this.id,
      status: "success",
      summary: "mocked",
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
    expect(adapter.sentTask?.from).toBe("codex");
    expect(router.tasks.get(result.taskId)?.status).toBe("success");
    expect(router.rooms.list()).toHaveLength(1);
  });
});
