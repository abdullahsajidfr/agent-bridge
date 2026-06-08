import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRouterConfigService, normalizeRouterConfig } from "../agent-router/daemon/config";

describe("AgentRouterConfigService", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-router-config-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("init writes default config without overwriting", () => {
    const svc = new AgentRouterConfigService(tempDir);
    expect(svc.init()).toBe(true);
    expect(svc.init()).toBe(false);
    expect(svc.validate()).toEqual([]);
  });

  test("normalizes custom agents and string policy values", () => {
    const config = normalizeRouterConfig({
      planner: "gemini",
      policies: { maxConcurrentTasks: "2", defaultTimeoutMs: "2000" },
      agents: {
        gemini: {
          enabled: true,
          command: "custom-gemini",
          args: ["-p"],
          role: "planner",
        },
      },
    });

    expect(config.planner).toBe("gemini");
    expect(config.policies.maxConcurrentTasks).toBe(2);
    expect(config.policies.defaultTimeoutMs).toBe(2000);
    expect(config.agents.gemini.command).toBe("custom-gemini");
    expect(config.agents.cursor.enabled).toBe(false);
  });

  test("validate reports missing configured planner", () => {
    const svc = new AgentRouterConfigService(tempDir);
    writeFileSync(svc.configPath, JSON.stringify({ planner: "missing", agents: {} }), "utf-8");
    expect(svc.validate()).toContain('Planner "missing" is not configured.');
  });
});
