export type AgentType = "codex" | "cursor" | "gemini" | "copilot";
export type AgentRole = "planner" | "implementer" | "reviewer" | "tester";
export type AgentTaskExpectedOutput = "patch" | "review" | "answer" | "test-report";
export type AgentTaskStatus = "queued" | "running" | "success" | "failed" | "partial" | "cancelled";

export interface AgentCapabilities {
  canEditFiles: boolean;
  canRunShell: boolean;
  supportsStreaming: boolean;
  supportsSessionResume: boolean;
  supportsStructuredOutput: boolean;
}

export interface AgentTask {
  id: string;
  roomId: string;
  from: string;
  to: string;
  repoPath: string;
  worktreePath?: string;
  objective: string;
  instructions: string;
  constraints: string[];
  allowedFiles?: string[];
  disallowedFiles?: string[];
  canEditFiles: boolean;
  canRunCommands: boolean;
  timeoutMs?: number;
  expectedOutput: AgentTaskExpectedOutput;
  metadata?: Record<string, unknown>;
}

export interface AgentCommandResult {
  command: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface AgentTestResult {
  command: string;
  passed: boolean;
  output?: string;
}

export interface AgentResult {
  taskId: string;
  agentId: string;
  status: "success" | "failed" | "partial" | "cancelled";
  summary: string;
  changedFiles: string[];
  diff?: string;
  commandsRun: AgentCommandResult[];
  testsRun: AgentTestResult[];
  risks: string[];
  questions: string[];
  rawLogPath?: string;
}

export interface AgentStatus {
  id: string;
  type: AgentType;
  role: AgentRole;
  available: boolean;
  details?: string;
}

export interface AgentAdapter {
  id: string;
  type: AgentType;
  role: AgentRole;
  capabilities: AgentCapabilities;

  start(): Promise<void>;
  stop(): Promise<void>;
  send(task: AgentTask): Promise<AgentResult>;
  cancel(taskId: string): Promise<void>;
  status(): Promise<AgentStatus>;
}

export interface Room {
  id: string;
  objective?: string;
  createdAt: string;
  taskIds: string[];
}

export interface TaskRecord {
  task: AgentTask;
  result?: AgentResult;
  status: AgentTaskStatus;
  createdAt: string;
  updatedAt: string;
}
