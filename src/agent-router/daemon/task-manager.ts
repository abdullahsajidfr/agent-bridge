import { EventEmitter } from "node:events";
import type { AgentRouterEvent } from "../protocol/events";
import type { AgentResult, AgentTask, TaskRecord } from "../protocol/types";

interface TaskManagerEvents {
  event: [AgentRouterEvent];
}

export class TaskManager extends EventEmitter<TaskManagerEvents> {
  private readonly tasks = new Map<string, TaskRecord>();

  constructor(initialTasks: TaskRecord[] = []) {
    super();
    for (const task of initialTasks) this.tasks.set(task.task.id, task);
  }

  create(task: AgentTask): TaskRecord {
    const now = new Date().toISOString();
    const record: TaskRecord = { task, status: "queued", createdAt: now, updatedAt: now };
    this.tasks.set(task.id, record);
    this.emit("event", { type: "task.created", task, timestamp: now });
    return record;
  }

  markRunning(taskId: string): void {
    this.updateStatus(taskId, "running");
  }

  complete(taskId: string, result: AgentResult): void {
    const record = this.tasks.get(taskId);
    if (!record) return;
    record.result = result;
    record.status = result.status;
    record.updatedAt = new Date().toISOString();
    this.emit("event", {
      type: result.status === "failed" ? "task.failed" : "task.completed",
      taskId,
      result,
      timestamp: record.updatedAt,
    });
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  list(): TaskRecord[] {
    return [...this.tasks.values()];
  }

  private updateStatus(taskId: string, status: TaskRecord["status"]): void {
    const record = this.tasks.get(taskId);
    if (!record) return;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    this.emit("event", { type: "task.status", taskId, status, timestamp: record.updatedAt });
  }
}
