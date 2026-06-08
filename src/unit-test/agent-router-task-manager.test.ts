import { describe, expect, test } from "bun:test";
import type { AgentResult, AgentTask } from "../agent-router/protocol/types";
import { TaskManager } from "../agent-router/daemon/task-manager";

describe("TaskManager", () => {
  test("tracks task lifecycle events", () => {
    const manager = new TaskManager();
    const events: string[] = [];
    manager.on("event", (event) => events.push(event.type));

    const task: AgentTask = {
      id: "task_1",
      roomId: "room_1",
      from: "codex",
      to: "gemini",
      repoPath: ".",
      objective: "Test objective",
      instructions: "Do it",
      constraints: [],
      canEditFiles: false,
      canRunCommands: false,
      expectedOutput: "answer",
    };
    const result: AgentResult = {
      taskId: task.id,
      agentId: "gemini",
      status: "success",
      summary: "Done",
      changedFiles: [],
      commandsRun: [],
      testsRun: [],
      risks: [],
      questions: [],
    };

    manager.create(task);
    manager.markRunning(task.id);
    manager.complete(task.id, result);

    expect(manager.get(task.id)?.status).toBe("success");
    expect(manager.get(task.id)?.result?.summary).toBe("Done");
    expect(events).toEqual(["task.created", "task.status", "task.completed"]);
  });
});
