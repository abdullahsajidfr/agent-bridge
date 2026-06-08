import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRouterStateStore } from "../agent-router/daemon/state-store";

describe("AgentRouterStateStore", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-router-state-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("round-trips rooms and task records", () => {
    const store = new AgentRouterStateStore(join(tempDir, ".agent-router", "state.json"));
    store.save({
      rooms: [{ id: "room_1", createdAt: "now", taskIds: ["task_1"] }],
      tasks: [{
        task: {
          id: "task_1",
          roomId: "room_1",
          from: "codex",
          to: "gemini",
          repoPath: ".",
          objective: "Do it",
          instructions: "Do it",
          constraints: [],
          canEditFiles: false,
          canRunCommands: true,
          expectedOutput: "answer",
        },
        status: "success",
        createdAt: "now",
        updatedAt: "now",
      }],
    });

    const loaded = store.load();
    expect(loaded.rooms[0].id).toBe("room_1");
    expect(loaded.tasks[0].task.id).toBe("task_1");
  });
});
