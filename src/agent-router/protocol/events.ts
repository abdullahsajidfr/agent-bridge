import type { AgentResult, AgentTask, AgentTaskStatus } from "./types";

export type AgentRouterEvent =
  | { type: "room.created"; roomId: string; objective?: string; timestamp: string }
  | { type: "task.created"; task: AgentTask; timestamp: string }
  | { type: "task.status"; taskId: string; status: AgentTaskStatus; timestamp: string }
  | { type: "task.completed"; taskId: string; result: AgentResult; timestamp: string }
  | { type: "task.failed"; taskId: string; result: AgentResult; timestamp: string };
