import { resolve } from "node:path";
import type { AgentResult, AgentTask, AgentTaskExpectedOutput } from "../protocol/types";
import type { AgentRouterConfig } from "./config";
import { AgentRegistry } from "./registry";
import { PolicyEngine } from "./policy-engine";
import { RoomManager } from "./room-manager";
import { TaskManager } from "./task-manager";
import { WorktreeManager } from "../supervisor/worktree-manager";
import type { Room, TaskRecord } from "../protocol/types";

interface AssignTaskInput {
  to: string;
  objective: string;
  instructions?: string;
  expectedOutput?: AgentTaskExpectedOutput;
  canEditFiles?: boolean;
  canRunCommands?: boolean;
  constraints?: string[];
  roomId?: string;
  dryRun?: boolean;
}

export class AgentRouter {
  readonly rooms = new RoomManager();
  readonly tasks = new TaskManager();
  private readonly policy: PolicyEngine;
  private readonly worktrees = new WorktreeManager();

  constructor(
    private readonly config: AgentRouterConfig,
    private readonly registry: AgentRegistry,
    initialState: { rooms?: Room[]; tasks?: TaskRecord[] } = {},
  ) {
    this.rooms = new RoomManager(initialState.rooms);
    this.tasks = new TaskManager(initialState.tasks);
    this.policy = new PolicyEngine(config);
  }

  async assign(input: AssignTaskInput): Promise<AgentResult> {
    const agent = this.registry.get(input.to);
    if (!agent) throw new Error(`No enabled agent registered with id "${input.to}".`);

    const repoPath = resolve(process.cwd(), this.config.repoPath);
    const room = input.roomId ? this.rooms.get(input.roomId) ?? this.rooms.create(input.objective) : this.rooms.create(input.objective);
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const canEditFiles = input.canEditFiles ?? agent.capabilities.canEditFiles;
    const task: AgentTask = {
      id: taskId,
      roomId: room.id,
      from: "codex",
      to: input.to,
      repoPath,
      objective: input.objective,
      instructions: input.instructions ?? input.objective,
      constraints: input.constraints ?? [],
      canEditFiles,
      canRunCommands: input.canRunCommands ?? agent.capabilities.canRunShell,
      timeoutMs: this.config.policies.defaultTimeoutMs,
      expectedOutput: input.expectedOutput ?? (canEditFiles ? "patch" : "answer"),
    };

    const policyErrors = this.policy.validateTask(task);
    if (policyErrors.length) throw new Error(policyErrors.join("\n"));

    if (task.canEditFiles) {
      task.worktreePath = this.worktrees.createForTask({
        repoPath,
        worktreesDir: this.config.worktreesDir,
        taskId,
        dryRun: input.dryRun ?? this.config.dryRun,
      });
    }

    this.tasks.create(task);
    this.rooms.addTask(room.id, task.id);
    this.tasks.markRunning(task.id);
    const result = await agent.send(task);
    this.tasks.complete(task.id, result);
    return result;
  }

  async runPlan(plannerId: string, objective: string): Promise<AgentResult> {
    return await this.assign({
      to: plannerId,
      objective,
      instructions: plannerPrompt(objective),
      expectedOutput: "answer",
      canEditFiles: false,
      canRunCommands: true,
    });
  }
}

export function plannerPrompt(objective: string): string {
  return [
    "You are the chief planning orchestrator.",
    "You should not directly edit files unless explicitly asked.",
    "Break the user objective into small implementation/review/test tasks.",
    "Delegate each task to one subagent.",
    "Prefer isolated worktrees for implementation.",
    "Require every subagent to return summary, changed files, diff, commands run, tests run, errors, risks, and follow-up questions.",
    "",
    `User objective: ${objective}`,
  ].join("\n");
}
