import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentAdapter, AgentResult, AgentTask, AgentTaskExpectedOutput } from "../protocol/types";
import type { AgentRouterConfig } from "./config";
import { AgentRegistry } from "./registry";
import { PolicyEngine } from "./policy-engine";
import { RoomManager } from "./room-manager";
import { TaskManager } from "./task-manager";
import { WorktreeManager } from "../supervisor/worktree-manager";
import type { Room, TaskRecord } from "../protocol/types";
import { parseAgentPlan, type ParsedAgentPlan } from "./plan-parser";

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

export interface PlanDispatchResult {
  roomId: string;
  plan: ParsedAgentPlan;
  plannerResult: AgentResult;
  subtaskResults: AgentResult[];
  status: "success" | "failed" | "partial";
  summary: string;
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
    const availableAgents = this.registry.list().filter((agent) => agent.id !== plannerId);
    return await this.assign({
      to: plannerId,
      objective,
      instructions: plannerPrompt(objective, availableAgents),
      expectedOutput: "answer",
      canEditFiles: false,
      canRunCommands: true,
    });
  }

  async runPlanAndDispatch(plannerId: string, objective: string, dryRun?: boolean): Promise<PlanDispatchResult> {
    const plannerResult = await this.runPlan(plannerId, objective);
    const plannerTask = this.tasks.get(plannerResult.taskId)?.task;
    const roomId = plannerTask?.roomId ?? this.rooms.create(objective).id;
    const plan = parseAgentPlan(plannerText(plannerResult));
    const subtaskResults: AgentResult[] = [];

    for (const plannedTask of plan.tasks) {
      subtaskResults.push(await this.assign({
        to: plannedTask.to,
        objective: plannedTask.objective,
        instructions: plannedTask.instructions,
        expectedOutput: plannedTask.expectedOutput,
        canEditFiles: plannedTask.canEditFiles,
        canRunCommands: plannedTask.canRunCommands,
        constraints: plannedTask.constraints,
        roomId,
        dryRun,
      }));
    }

    const failedCount = subtaskResults.filter((result) => result.status === "failed" || result.status === "cancelled").length;
    const partialCount = subtaskResults.filter((result) => result.status === "partial").length;
    const status = failedCount === 0 && partialCount === 0 ? "success" : failedCount === subtaskResults.length ? "failed" : "partial";

    return {
      roomId,
      plan,
      plannerResult,
      subtaskResults,
      status,
      summary: `Dispatched ${subtaskResults.length} planned task(s): ${subtaskResults.length - failedCount} completed, ${failedCount} failed.`,
    };
  }
}

export function plannerText(result: AgentResult): string {
  return [
    result.summary,
    fullStdoutFromRawLog(result.rawLogPath),
    result.commandsRun.map((command) => command.stdout).filter(Boolean).join("\n"),
  ].filter(Boolean).join("\n");
}

function fullStdoutFromRawLog(rawLogPath?: string): string | undefined {
  if (!rawLogPath) return undefined;
  try {
    const rawLog = readFileSync(rawLogPath, "utf8");
    const stdoutMarker = "\nSTDOUT:\n";
    const stderrMarker = "\n\nSTDERR:\n";
    const stdoutStart = rawLog.indexOf(stdoutMarker);
    if (stdoutStart === -1) return rawLog;
    const contentStart = stdoutStart + stdoutMarker.length;
    const stderrStart = rawLog.indexOf(stderrMarker, contentStart);
    return rawLog.slice(contentStart, stderrStart === -1 ? undefined : stderrStart);
  } catch {
    return undefined;
  }
}

export function plannerPrompt(objective: string, availableAgents: AgentAdapter[] = []): string {
  const agentLines = availableAgents.map((agent) => (
    `- ${agent.id}: role=${agent.role}, type=${agent.type}, canEditFiles=${agent.capabilities.canEditFiles}, canRunCommands=${agent.capabilities.canRunShell}`
  ));
  const taskShape = {
    summary: "brief plan summary",
    tasks: [{
      to: availableAgents.length ? availableAgents.map((agent) => agent.id).join(" | ") : "gemini | cursor | copilot",
      objective: "short task objective",
      instructions: "specific instructions for the assigned subagent",
      expectedOutput: "patch | review | answer | test-report",
      canEditFiles: true,
      canRunCommands: true,
      constraints: ["constraint"],
    }],
  };

  return [
    "You are the chief planning orchestrator.",
    "You should not directly edit files unless explicitly asked.",
    "Break the user objective into small implementation/review/test tasks.",
    "Delegate each task to one subagent.",
    availableAgents.length
      ? "Use only the enabled subagent ids listed below. Do not assign tasks to any other adapter id."
      : "If no enabled subagents are listed, return an empty tasks array and explain why in the summary.",
    availableAgents.length ? ["Enabled subagents:", ...agentLines].join("\n") : "Enabled subagents: none",
    "Prefer isolated worktrees for implementation.",
    "Require every subagent to return summary, changed files, diff, commands run, tests run, errors, risks, and follow-up questions.",
    "Return only JSON. Do not wrap it in markdown.",
    "The JSON must match this shape:",
    JSON.stringify(taskShape, null, 2),
    "",
    `User objective: ${objective}`,
  ].join("\n");
}
