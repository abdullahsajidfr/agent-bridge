#!/usr/bin/env bun
// @bun

// src/agent-router/daemon/config.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
var AGENT_ROUTER_CONFIG_FILE = "agent-router.config.json";
var DEFAULT_AGENT_ROUTER_CONFIG = {
  planner: "codex",
  repoPath: ".",
  worktreesDir: "../.agent-worktrees",
  agents: {
    codex: {
      enabled: true,
      command: "codex",
      args: ["exec", "--json"],
      role: "planner",
      type: "codex",
      canEditFiles: false,
      canRunShell: true,
      supportsStreaming: true,
      supportsSessionResume: false,
      supportsStructuredOutput: true
    },
    gemini: {
      enabled: true,
      command: "gemini",
      args: ["-p"],
      role: "implementer",
      type: "gemini",
      canEditFiles: true,
      canRunShell: true,
      supportsStreaming: true,
      supportsSessionResume: false,
      supportsStructuredOutput: true
    },
    copilot: {
      enabled: true,
      command: "copilot",
      args: ["--prompt"],
      role: "reviewer",
      type: "copilot",
      canEditFiles: false,
      canRunShell: true,
      supportsStreaming: false,
      supportsSessionResume: false,
      supportsStructuredOutput: true
    },
    cursor: {
      enabled: false,
      command: "cursor-agent",
      args: [],
      role: "implementer",
      type: "cursor",
      canEditFiles: true,
      canRunShell: true,
      supportsStreaming: true,
      supportsSessionResume: true,
      supportsStructuredOutput: false
    }
  },
  policies: {
    requireHumanApprovalBeforeApply: true,
    allowSubagentShellCommands: true,
    allowSubagentGitCommands: false,
    maxConcurrentTasks: 3,
    defaultTimeoutMs: 600000
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
function asBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function asInteger(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed))
      return Math.trunc(parsed);
  }
  return fallback;
}
function asStringArray(value, fallback) {
  if (!Array.isArray(value))
    return fallback;
  return value.filter((item) => typeof item === "string");
}
function normalizeAgentType(id, value) {
  if (value === "codex" || value === "cursor" || value === "gemini" || value === "copilot")
    return value;
  if (id === "codex" || id === "cursor" || id === "gemini" || id === "copilot")
    return id;
  return "gemini";
}
function normalizeRole(value, fallback) {
  if (value === "planner" || value === "implementer" || value === "reviewer" || value === "tester")
    return value;
  return fallback;
}
function normalizeRouterConfig(raw) {
  if (!isRecord(raw))
    return structuredClone(DEFAULT_AGENT_ROUTER_CONFIG);
  const defaults = DEFAULT_AGENT_ROUTER_CONFIG;
  const rawAgents = isRecord(raw.agents) ? raw.agents : {};
  const agents = {};
  for (const [id, defaultAgent] of Object.entries(defaults.agents)) {
    const rawAgent = isRecord(rawAgents[id]) ? rawAgents[id] : {};
    agents[id] = {
      enabled: asBoolean(rawAgent.enabled, defaultAgent.enabled),
      command: asString(rawAgent.command, defaultAgent.command),
      args: asStringArray(rawAgent.args, defaultAgent.args),
      role: normalizeRole(rawAgent.role, defaultAgent.role),
      type: normalizeAgentType(id, rawAgent.type ?? defaultAgent.type),
      canEditFiles: asBoolean(rawAgent.canEditFiles, defaultAgent.canEditFiles ?? true),
      canRunShell: asBoolean(rawAgent.canRunShell, defaultAgent.canRunShell ?? true),
      supportsStreaming: asBoolean(rawAgent.supportsStreaming, defaultAgent.supportsStreaming ?? false),
      supportsSessionResume: asBoolean(rawAgent.supportsSessionResume, defaultAgent.supportsSessionResume ?? false),
      supportsStructuredOutput: asBoolean(rawAgent.supportsStructuredOutput, defaultAgent.supportsStructuredOutput ?? false)
    };
  }
  for (const [id, value] of Object.entries(rawAgents)) {
    if (agents[id] || !isRecord(value))
      continue;
    agents[id] = {
      enabled: asBoolean(value.enabled, true),
      command: asString(value.command, id),
      args: asStringArray(value.args, []),
      role: normalizeRole(value.role, "implementer"),
      type: normalizeAgentType(id, value.type),
      canEditFiles: asBoolean(value.canEditFiles, true),
      canRunShell: asBoolean(value.canRunShell, true),
      supportsStreaming: asBoolean(value.supportsStreaming, false),
      supportsSessionResume: asBoolean(value.supportsSessionResume, false),
      supportsStructuredOutput: asBoolean(value.supportsStructuredOutput, false)
    };
  }
  const rawPolicies = isRecord(raw.policies) ? raw.policies : {};
  return {
    planner: asString(raw.planner, defaults.planner),
    repoPath: asString(raw.repoPath, defaults.repoPath),
    worktreesDir: asString(raw.worktreesDir, defaults.worktreesDir),
    dryRun: asBoolean(raw.dryRun, defaults.dryRun ?? false),
    agents,
    policies: {
      requireHumanApprovalBeforeApply: asBoolean(rawPolicies.requireHumanApprovalBeforeApply, defaults.policies.requireHumanApprovalBeforeApply),
      allowSubagentShellCommands: asBoolean(rawPolicies.allowSubagentShellCommands, defaults.policies.allowSubagentShellCommands),
      allowSubagentGitCommands: asBoolean(rawPolicies.allowSubagentGitCommands, defaults.policies.allowSubagentGitCommands),
      maxConcurrentTasks: asInteger(rawPolicies.maxConcurrentTasks, defaults.policies.maxConcurrentTasks),
      defaultTimeoutMs: asInteger(rawPolicies.defaultTimeoutMs, defaults.policies.defaultTimeoutMs)
    }
  };
}

class AgentRouterConfigService {
  cwd;
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
  }
  get configPath() {
    return resolve(this.cwd, AGENT_ROUTER_CONFIG_FILE);
  }
  hasConfig() {
    return existsSync(this.configPath);
  }
  load() {
    if (!this.hasConfig())
      return structuredClone(DEFAULT_AGENT_ROUTER_CONFIG);
    const raw = JSON.parse(readFileSync(this.configPath, "utf-8"));
    return normalizeRouterConfig(raw);
  }
  init() {
    if (this.hasConfig())
      return false;
    writeFileSync(this.configPath, JSON.stringify(DEFAULT_AGENT_ROUTER_CONFIG, null, 2) + `
`, "utf-8");
    return true;
  }
  validate(config = this.load()) {
    const errors = [];
    if (!config.agents[config.planner])
      errors.push(`Planner "${config.planner}" is not configured.`);
    if (config.policies.maxConcurrentTasks < 1)
      errors.push("policies.maxConcurrentTasks must be at least 1.");
    if (config.policies.defaultTimeoutMs < 1000)
      errors.push("policies.defaultTimeoutMs must be at least 1000.");
    for (const [id, agent] of Object.entries(config.agents)) {
      if (!agent.command.trim())
        errors.push(`agents.${id}.command is required.`);
      if (!Array.isArray(agent.args))
        errors.push(`agents.${id}.args must be an array.`);
    }
    return errors;
  }
}

// src/agent-router/daemon/registry.ts
class AgentRegistry {
  agents = new Map;
  register(adapter) {
    this.agents.set(adapter.id, adapter);
  }
  get(id) {
    return this.agents.get(id);
  }
  list() {
    return [...this.agents.values()];
  }
}

// src/agent-router/daemon/router.ts
import { resolve as resolve3 } from "path";

// src/agent-router/daemon/policy-engine.ts
class PolicyEngine {
  config;
  constructor(config) {
    this.config = config;
  }
  validateTask(task) {
    const errors = [];
    if (task.canRunCommands && !this.config.policies.allowSubagentShellCommands) {
      errors.push("Shell commands are disabled by policy.");
    }
    if (task.canRunCommands && !this.config.policies.allowSubagentGitCommands) {
      const constraints = task.constraints.join(`
`).toLowerCase();
      if (!constraints.includes("no git commands")) {
        task.constraints.push("Do not run git commands.");
      }
    }
    if (task.canEditFiles && this.config.policies.requireHumanApprovalBeforeApply) {
      task.constraints.push("Return changes as worktree diff; do not apply to the main working tree.");
    }
    return errors;
  }
}

// src/agent-router/daemon/room-manager.ts
class RoomManager {
  rooms = new Map;
  constructor(initialRooms = []) {
    for (const room of initialRooms)
      this.rooms.set(room.id, room);
  }
  create(objective) {
    const room = {
      id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      objective,
      createdAt: new Date().toISOString(),
      taskIds: []
    };
    this.rooms.set(room.id, room);
    return room;
  }
  addTask(roomId, taskId) {
    const room = this.rooms.get(roomId);
    if (room)
      room.taskIds.push(taskId);
  }
  get(roomId) {
    return this.rooms.get(roomId);
  }
  list() {
    return [...this.rooms.values()];
  }
}

// src/agent-router/daemon/task-manager.ts
import { EventEmitter } from "events";

class TaskManager extends EventEmitter {
  tasks = new Map;
  constructor(initialTasks = []) {
    super();
    for (const task of initialTasks)
      this.tasks.set(task.task.id, task);
  }
  create(task) {
    const now = new Date().toISOString();
    const record = { task, status: "queued", createdAt: now, updatedAt: now };
    this.tasks.set(task.id, record);
    this.emit("event", { type: "task.created", task, timestamp: now });
    return record;
  }
  markRunning(taskId) {
    this.updateStatus(taskId, "running");
  }
  complete(taskId, result) {
    const record = this.tasks.get(taskId);
    if (!record)
      return;
    record.result = result;
    record.status = result.status;
    record.updatedAt = new Date().toISOString();
    this.emit("event", {
      type: result.status === "failed" ? "task.failed" : "task.completed",
      taskId,
      result,
      timestamp: record.updatedAt
    });
  }
  get(taskId) {
    return this.tasks.get(taskId);
  }
  list() {
    return [...this.tasks.values()];
  }
  updateStatus(taskId, status) {
    const record = this.tasks.get(taskId);
    if (!record)
      return;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    this.emit("event", { type: "task.status", taskId, status, timestamp: record.updatedAt });
  }
}

// src/agent-router/supervisor/worktree-manager.ts
import { execFileSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { basename, resolve as resolve2 } from "path";

class WorktreeManager {
  createForTask(opts) {
    const repoPath = resolve2(opts.repoPath);
    const worktreesDir = resolve2(repoPath, opts.worktreesDir);
    const branch = `agent-router/${opts.taskId}`;
    const worktreePath = resolve2(worktreesDir, `${basename(repoPath)}-${opts.taskId}`);
    if (opts.dryRun)
      return worktreePath;
    mkdirSync(worktreesDir, { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", branch, worktreePath, "HEAD"], {
      cwd: repoPath,
      stdio: "pipe"
    });
    return worktreePath;
  }
  clean(worktreesDir, repoPath = process.cwd()) {
    const target = resolve2(repoPath, worktreesDir);
    rmSync(target, { recursive: true, force: true });
  }
}

// src/agent-router/daemon/plan-parser.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function asBoolean2(value) {
  return typeof value === "boolean" ? value : undefined;
}
function asStringArray2(value) {
  if (!Array.isArray(value))
    return;
  return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}
function asExpectedOutput(value) {
  if (value === "patch" || value === "review" || value === "answer" || value === "test-report")
    return value;
  return;
}
function parseAgentPlan(text) {
  const json = parsePlanJson(text);
  if (json)
    return json;
  const tasks = parseLooseTasks(text);
  if (tasks.length)
    return { tasks };
  throw new Error("Planner output did not contain a parseable task plan.");
}
function parsePlanJson(text) {
  for (const candidate of jsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizePlan(parsed);
      if (normalized.tasks.length)
        return normalized;
    } catch {}
  }
  return null;
}
function jsonCandidates(text) {
  const trimmed = text.trim();
  const candidates = new Set;
  if (trimmed.startsWith("{") || trimmed.startsWith("["))
    candidates.add(trimmed);
  const fencedJson = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of trimmed.matchAll(fencedJson)) {
    const body = match[1]?.trim();
    if (body)
      candidates.add(body);
  }
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart)
    candidates.add(trimmed.slice(objectStart, objectEnd + 1));
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart)
    candidates.add(trimmed.slice(arrayStart, arrayEnd + 1));
  for (const line of trimmed.split(`
`)) {
    try {
      collectJsonStrings(JSON.parse(line), candidates);
    } catch {}
  }
  return [...candidates];
}
function collectJsonStrings(value, candidates) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("["))
      candidates.add(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value)
      collectJsonStrings(item, candidates);
    return;
  }
  if (isRecord2(value)) {
    for (const item of Object.values(value))
      collectJsonStrings(item, candidates);
  }
}
function normalizePlan(value) {
  const tasksValue = Array.isArray(value) ? value : isRecord2(value) && Array.isArray(value.tasks) ? value.tasks : [];
  const tasks = tasksValue.map(normalizeTask).filter((task) => Boolean(task));
  return {
    summary: isRecord2(value) ? asString2(value.summary) : undefined,
    tasks
  };
}
function normalizeTask(value) {
  if (!isRecord2(value))
    return null;
  const to = asString2(value.to ?? value.agent ?? value.assignee);
  const objective = asString2(value.objective ?? value.title ?? value.task);
  if (!to || !objective)
    return null;
  return {
    to,
    objective,
    instructions: asString2(value.instructions ?? value.prompt ?? value.details) ?? objective,
    expectedOutput: asExpectedOutput(value.expectedOutput ?? value.expected_output),
    canEditFiles: asBoolean2(value.canEditFiles ?? value.can_edit_files),
    canRunCommands: asBoolean2(value.canRunCommands ?? value.can_run_commands),
    constraints: asStringArray2(value.constraints)
  };
}
function parseLooseTasks(text) {
  const tasks = [];
  const lines = text.split(`
`);
  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*]|\d+[.)])\s*(?:\[(?<agent>[a-zA-Z0-9_-]+)\]|(?<agent2>codex|cursor|gemini|copilot)\s*[:\-])\s*(?<objective>.+)$/i);
    if (!match?.groups)
      continue;
    const to = (match.groups.agent ?? match.groups.agent2)?.toLowerCase();
    const objective = match.groups.objective?.trim();
    if (!to || !objective)
      continue;
    tasks.push({ to, objective, instructions: objective });
  }
  return tasks;
}

// src/agent-router/daemon/router.ts
class AgentRouter {
  config;
  registry;
  rooms = new RoomManager;
  tasks = new TaskManager;
  policy;
  worktrees = new WorktreeManager;
  constructor(config, registry, initialState = {}) {
    this.config = config;
    this.registry = registry;
    this.rooms = new RoomManager(initialState.rooms);
    this.tasks = new TaskManager(initialState.tasks);
    this.policy = new PolicyEngine(config);
  }
  async assign(input) {
    const agent = this.registry.get(input.to);
    if (!agent)
      throw new Error(`No enabled agent registered with id "${input.to}".`);
    const repoPath = resolve3(process.cwd(), this.config.repoPath);
    const room = input.roomId ? this.rooms.get(input.roomId) ?? this.rooms.create(input.objective) : this.rooms.create(input.objective);
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const canEditFiles = input.canEditFiles ?? agent.capabilities.canEditFiles;
    const task = {
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
      expectedOutput: input.expectedOutput ?? (canEditFiles ? "patch" : "answer")
    };
    const policyErrors = this.policy.validateTask(task);
    if (policyErrors.length)
      throw new Error(policyErrors.join(`
`));
    if (task.canEditFiles) {
      task.worktreePath = this.worktrees.createForTask({
        repoPath,
        worktreesDir: this.config.worktreesDir,
        taskId,
        dryRun: input.dryRun ?? this.config.dryRun
      });
    }
    this.tasks.create(task);
    this.rooms.addTask(room.id, task.id);
    this.tasks.markRunning(task.id);
    const result = await agent.send(task);
    this.tasks.complete(task.id, result);
    return result;
  }
  async runPlan(plannerId, objective) {
    return await this.assign({
      to: plannerId,
      objective,
      instructions: plannerPrompt(objective),
      expectedOutput: "answer",
      canEditFiles: false,
      canRunCommands: true
    });
  }
  async runPlanAndDispatch(plannerId, objective, dryRun) {
    const plannerResult = await this.runPlan(plannerId, objective);
    const plannerTask = this.tasks.get(plannerResult.taskId)?.task;
    const roomId = plannerTask?.roomId ?? this.rooms.create(objective).id;
    const plan = parseAgentPlan(plannerText(plannerResult));
    const subtaskResults = [];
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
        dryRun
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
      summary: `Dispatched ${subtaskResults.length} planned task(s): ${subtaskResults.length - failedCount} completed, ${failedCount} failed.`
    };
  }
}
function plannerText(result) {
  return [
    result.summary,
    result.commandsRun.map((command) => command.stdout).filter(Boolean).join(`
`)
  ].filter(Boolean).join(`
`);
}
function plannerPrompt(objective) {
  return [
    "You are the chief planning orchestrator.",
    "You should not directly edit files unless explicitly asked.",
    "Break the user objective into small implementation/review/test tasks.",
    "Delegate each task to one subagent.",
    "Prefer isolated worktrees for implementation.",
    "Require every subagent to return summary, changed files, diff, commands run, tests run, errors, risks, and follow-up questions.",
    "Return only JSON. Do not wrap it in markdown.",
    "The JSON must match this shape:",
    JSON.stringify({
      summary: "brief plan summary",
      tasks: [{
        to: "gemini | cursor | copilot",
        objective: "short task objective",
        instructions: "specific instructions for the assigned subagent",
        expectedOutput: "patch | review | answer | test-report",
        canEditFiles: true,
        canRunCommands: true,
        constraints: ["constraint"]
      }]
    }, null, 2),
    "",
    `User objective: ${objective}`
  ].join(`
`);
}

// src/agent-router/daemon/state-store.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname, resolve as resolve4 } from "path";

class AgentRouterStateStore {
  statePath;
  constructor(statePath = resolve4(process.cwd(), ".agent-router", "state.json")) {
    this.statePath = statePath;
  }
  load() {
    try {
      if (!existsSync2(this.statePath))
        return { rooms: [], tasks: [] };
      const parsed = JSON.parse(readFileSync2(this.statePath, "utf-8"));
      return {
        rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
      };
    } catch {
      return { rooms: [], tasks: [] };
    }
  }
  save(state) {
    mkdirSync2(dirname(this.statePath), { recursive: true });
    writeFileSync2(this.statePath, JSON.stringify(state, null, 2) + `
`, "utf-8");
  }
}

// src/agent-router/adapters/cli-agent-adapter.ts
import { existsSync as existsSync3 } from "fs";

// src/agent-router/supervisor/diff-collector.ts
import { execFileSync as execFileSync2 } from "child_process";

class DiffCollector {
  collect(repoPath) {
    const changedFiles = this.runGit(repoPath, ["status", "--porcelain", "--untracked-files=all"]).split(`
`).map((line) => parseStatusPath(line)).filter(Boolean);
    const diff = [
      this.runGit(repoPath, ["diff", "--no-ext-diff"]),
      this.untrackedSummary(repoPath)
    ].filter(Boolean).join(`
`);
    return { changedFiles, diff };
  }
  runGit(cwd, args) {
    try {
      return execFileSync2("git", args, { cwd, encoding: "utf-8" });
    } catch {
      return "";
    }
  }
  untrackedSummary(cwd) {
    const untracked = this.runGit(cwd, ["ls-files", "--others", "--exclude-standard"]).split(`
`).map((line) => line.trim()).filter(Boolean);
    if (!untracked.length)
      return "";
    return [
      "Untracked files:",
      ...untracked.map((file) => `- ${file}`)
    ].join(`
`);
  }
}
function parseStatusPath(line) {
  if (!line.trim())
    return "";
  const path = line.slice(3).trim();
  const renameSeparator = " -> ";
  return path.includes(renameSeparator) ? path.split(renameSeparator).at(-1) ?? path : path;
}

// src/agent-router/supervisor/log-stream.ts
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync3 } from "fs";
import { join, resolve as resolve5 } from "path";

class LogStream {
  root;
  constructor(root = ".agent-router/logs") {
    this.root = root;
  }
  write(taskId, content) {
    const dir = resolve5(process.cwd(), this.root);
    mkdirSync3(dir, { recursive: true });
    const path = join(dir, `${taskId}.log`);
    writeFileSync3(path, content, "utf-8");
    return path;
  }
}

// src/agent-router/supervisor/process-runner.ts
import { spawn } from "child_process";

class ProcessRunner {
  async run(opts) {
    const printable = [opts.command, ...opts.args].join(" ");
    if (opts.dryRun) {
      return {
        command: printable,
        exitCode: 0,
        stdout: `[dry-run] ${printable}`,
        stderr: "",
        timedOut: false
      };
    }
    return await new Promise((resolve6) => {
      let proc;
      try {
        proc = spawn(opts.command, opts.args, {
          cwd: opts.cwd,
          env: { ...process.env, ...opts.env },
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (err) {
        resolve6({
          command: printable,
          exitCode: 127,
          stdout: "",
          stderr: err?.message ?? String(err),
          timedOut: false
        });
        return;
      }
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled)
          return;
        proc.kill("SIGTERM");
        setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {}
        }, 1000);
      }, opts.timeoutMs);
      proc.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proc.on("error", (err) => {
        if (settled)
          return;
        settled = true;
        clearTimeout(timer);
        resolve6({ command: printable, exitCode: 127, stdout, stderr: stderr + err.message, timedOut: false });
      });
      proc.on("exit", (code, signal) => {
        if (settled)
          return;
        settled = true;
        const timedOut = signal === "SIGTERM" || signal === "SIGKILL";
        clearTimeout(timer);
        resolve6({ command: printable, exitCode: code ?? undefined, stdout, stderr, timedOut });
      });
      if (opts.input)
        proc.stdin?.write(opts.input);
      proc.stdin?.end();
    });
  }
}

// src/agent-router/adapters/cli-agent-adapter.ts
class CliAgentAdapter {
  id;
  type;
  role;
  capabilities;
  config;
  dryRun;
  runner;
  diffCollector;
  logStream;
  cancelledTaskIds = new Set;
  constructor(opts) {
    this.id = opts.id;
    this.type = opts.type;
    this.config = opts.config;
    this.role = opts.config.role;
    this.capabilities = {
      canEditFiles: opts.config.canEditFiles ?? true,
      canRunShell: opts.config.canRunShell ?? true,
      supportsStreaming: opts.config.supportsStreaming ?? false,
      supportsSessionResume: opts.config.supportsSessionResume ?? false,
      supportsStructuredOutput: opts.config.supportsStructuredOutput ?? false
    };
    this.dryRun = opts.dryRun ?? false;
    this.runner = opts.runner ?? new ProcessRunner;
    this.diffCollector = opts.diffCollector ?? new DiffCollector;
    this.logStream = opts.logStream ?? new LogStream;
  }
  async start() {}
  async stop() {}
  async send(task) {
    if (this.cancelledTaskIds.has(task.id))
      return this.cancelled(task);
    const cwd = task.worktreePath ?? task.repoPath;
    if (!this.dryRun && !existsSync3(cwd)) {
      return this.failure(task, `Working directory does not exist: ${cwd}`);
    }
    const prompt = this.buildPrompt(task);
    const run = await this.runner.run({
      cwd,
      command: this.config.command,
      args: buildCommandArgs(this.config.args, prompt),
      timeoutMs: task.timeoutMs ?? 600000,
      dryRun: this.dryRun
    });
    const rawLogPath = this.logStream.write(task.id, [
      `$ ${run.command}`,
      "",
      "STDOUT:",
      run.stdout,
      "",
      "STDERR:",
      run.stderr
    ].join(`
`));
    const parsed = parseStructuredResult(run.stdout);
    const diffState = task.canEditFiles ? this.diffCollector.collect(cwd) : { changedFiles: [], diff: "" };
    const status = run.exitCode === 0 && !run.timedOut ? "success" : "failed";
    return {
      taskId: task.id,
      agentId: this.id,
      status: parsed?.status ?? status,
      summary: parsed?.summary ?? summarizeOutput(run.stdout, run.stderr, run.timedOut),
      changedFiles: parsed?.changedFiles?.length ? parsed.changedFiles : diffState.changedFiles,
      diff: parsed?.diff ?? diffState.diff,
      commandsRun: parsed?.commandsRun?.length ? parsed.commandsRun : [{
        command: run.command,
        exitCode: run.exitCode,
        stdout: truncate(run.stdout),
        stderr: truncate(run.stderr)
      }],
      testsRun: parsed?.testsRun ?? [],
      risks: parsed?.risks ?? (run.timedOut ? ["Task timed out before the adapter completed."] : []),
      questions: parsed?.questions ?? [],
      rawLogPath
    };
  }
  async cancel(taskId) {
    this.cancelledTaskIds.add(taskId);
  }
  async status() {
    return {
      id: this.id,
      type: this.type,
      role: this.role,
      available: this.config.enabled,
      details: this.config.enabled ? `${this.config.command} ${this.config.args.join(" ")}`.trim() : "disabled in config"
    };
  }
  buildPrompt(task) {
    return [
      `You are the ${this.id} ${this.role} subagent in AgentRouter.`,
      `Task id: ${task.id}`,
      `Room id: ${task.roomId}`,
      `Objective: ${task.objective}`,
      "",
      "Instructions:",
      task.instructions,
      "",
      `Expected output: ${task.expectedOutput}`,
      `Can edit files: ${task.canEditFiles}`,
      `Can run commands: ${task.canRunCommands}`,
      task.constraints.length ? `Constraints:
${task.constraints.map((item) => `- ${item}`).join(`
`)}` : "Constraints: none",
      task.allowedFiles?.length ? `Allowed files:
${task.allowedFiles.map((item) => `- ${item}`).join(`
`)}` : "",
      task.disallowedFiles?.length ? `Disallowed files:
${task.disallowedFiles.map((item) => `- ${item}`).join(`
`)}` : "",
      "",
      "Return a JSON object with this shape:",
      JSON.stringify({
        status: "success | failed | partial | cancelled",
        summary: "brief result",
        changedFiles: ["path"],
        diff: "optional unified diff",
        commandsRun: [{ command: "string", exitCode: 0, stdout: "optional", stderr: "optional" }],
        testsRun: [{ command: "string", passed: true, output: "optional" }],
        risks: ["risk"],
        questions: ["question"]
      }, null, 2)
    ].filter(Boolean).join(`
`);
  }
  cancelled(task) {
    return {
      taskId: task.id,
      agentId: this.id,
      status: "cancelled",
      summary: "Task was cancelled before execution.",
      changedFiles: [],
      commandsRun: [],
      testsRun: [],
      risks: [],
      questions: []
    };
  }
  failure(task, summary) {
    return {
      taskId: task.id,
      agentId: this.id,
      status: "failed",
      summary,
      changedFiles: [],
      commandsRun: [],
      testsRun: [],
      risks: [summary],
      questions: []
    };
  }
}
function parseStructuredResult(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed)
    return null;
  const candidates = [
    trimmed,
    trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
  ].filter((item) => item.startsWith("{") && item.endsWith("}"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isStructuredAgentResult(parsed))
        return parsed;
    } catch {}
  }
  return null;
}
function buildCommandArgs(args, prompt) {
  if (!args.some((arg) => arg.includes("{prompt}")))
    return [...args, prompt];
  return args.map((arg) => arg.replaceAll("{prompt}", prompt));
}
function isStructuredAgentResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return false;
  const status = value.status;
  return status === "success" || status === "failed" || status === "partial" || status === "cancelled";
}
function summarizeOutput(stdout, stderr, timedOut) {
  if (timedOut)
    return "Adapter command timed out.";
  const content = stdout.trim() || stderr.trim();
  return content ? truncate(content, 1000) : "Adapter command completed with no output.";
}
function truncate(value, limit = 4000) {
  return value.length > limit ? `${value.slice(0, limit)}
[truncated]` : value;
}

// src/agent-router/adapters/index.ts
function createConfiguredAdapters(config) {
  return Object.entries(config.agents).filter(([, agent]) => agent.enabled).map(([id, agent]) => new CliAgentAdapter({
    id,
    type: agent.type ?? id,
    config: agent,
    dryRun: config.dryRun
  }));
}

// src/agent-router/cli.ts
var args = process.argv.slice(2);
var command = args[0];
var rest = args.slice(1);
async function main() {
  const configService = new AgentRouterConfigService;
  switch (command) {
    case "init": {
      const created = configService.init();
      console.log(created ? `Created ${configService.configPath}` : `${configService.configPath} already exists`);
      return;
    }
    case "config:validate": {
      const errors = configService.validate();
      if (errors.length) {
        console.error(errors.join(`
`));
        process.exit(1);
      }
      console.log("agent-router config is valid");
      return;
    }
    case "agents:list":
    case "agents:status": {
      const { registry } = loadRuntime(configService);
      const statuses = await Promise.all(registry.list().map((agent) => agent.status()));
      console.log(JSON.stringify(statuses, null, 2));
      return;
    }
    case "task:assign": {
      const options = parseOptions(rest);
      const to = requireOption(options, "to");
      const objective = requireOption(options, "objective");
      const { router, config } = loadRuntime(configService, options["dry-run"] === "true");
      const result = await router.assign({
        to,
        objective,
        instructions: options.instructions,
        expectedOutput: options["expected-output"],
        canEditFiles: parseBooleanOption(options, "edit"),
        canRunCommands: parseBooleanOption(options, "commands"),
        dryRun: options["dry-run"] === "true" || config.dryRun
      });
      saveRuntimeState(router);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "task:review": {
      const options = parseOptions(rest);
      const to = options.to ?? "copilot";
      const { router, config } = loadRuntime(configService, options["dry-run"] === "true");
      const instructions = options.diff ? buildDiffReviewInstructions(config.repoPath, options.instructions) : options.instructions;
      const result = await router.assign({
        to,
        objective: options.objective ?? "Review the current diff and report risks.",
        instructions,
        expectedOutput: "review",
        canEditFiles: false,
        canRunCommands: true,
        dryRun: options["dry-run"] === "true"
      });
      saveRuntimeState(router);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "task:run-plan": {
      const options = parseOptions(rest);
      const objective = requireOption(options, "objective");
      const { router, config } = loadRuntime(configService, options["dry-run"] === "true");
      const planner = options.planner ?? config.planner;
      const result = options.execute === "true" ? await router.runPlanAndDispatch(planner, objective, options["dry-run"] === "true" || config.dryRun) : await router.runPlan(planner, objective);
      saveRuntimeState(router);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "rooms:list": {
      const state = new AgentRouterStateStore().load();
      console.log(JSON.stringify(state.rooms, null, 2));
      return;
    }
    case "rooms:show": {
      const roomId = rest[0];
      if (!roomId)
        throw new Error("rooms:show requires <roomId>.");
      const state = new AgentRouterStateStore().load();
      const room = state.rooms.find((item) => item.id === roomId);
      const tasks = state.tasks.filter((item) => item.task.roomId === roomId);
      console.log(JSON.stringify(room ? { room, tasks } : null, null, 2));
      return;
    }
    case "worktrees:clean": {
      const config = configService.load();
      new WorktreeManager().clean(config.worktreesDir, config.repoPath);
      console.log(`Cleaned ${config.worktreesDir}`);
      return;
    }
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}
function loadRuntime(configService, dryRunOverride = false) {
  const config = configService.load();
  if (dryRunOverride)
    config.dryRun = true;
  const state = new AgentRouterStateStore().load();
  const registry = new AgentRegistry;
  for (const adapter of createConfiguredAdapters(config))
    registry.register(adapter);
  return { config, registry, router: new AgentRouter(config, registry, state) };
}
function saveRuntimeState(router) {
  new AgentRouterStateStore().save({
    rooms: router.rooms.list(),
    tasks: router.tasks.list()
  });
}
function parseOptions(values) {
  const parsed = {};
  for (let index = 0;index < values.length; index++) {
    const value = values[index];
    if (!value.startsWith("--"))
      continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index++;
    }
  }
  return parsed;
}
function requireOption(options, key) {
  const value = options[key];
  if (!value)
    throw new Error(`Missing required --${key} option.`);
  return value;
}
function parseBooleanOption(options, key) {
  if (!(key in options))
    return;
  return options[key] === "true";
}
function buildDiffReviewInstructions(repoPath, extraInstructions) {
  const { changedFiles, diff } = new DiffCollector().collect(repoPath);
  return [
    extraInstructions ?? "Review the repository diff and return a structured review result.",
    "",
    `Changed files (${changedFiles.length}):`,
    changedFiles.length ? changedFiles.map((file) => `- ${file}`).join(`
`) : "- none",
    "",
    "Diff:",
    diff || "(no diff)"
  ].join(`
`);
}
function printHelp() {
  console.log(`
AgentRouter \u2014 local multi-agent coding orchestration

Usage:
  agent-router <command> [options]

Commands:
  init
  agents:list
  agents:status
  task:assign --to gemini --objective "..."
  task:review --to copilot --diff
  task:run-plan --planner codex --objective "..."
  task:run-plan --planner codex --objective "..." --execute
  rooms:list
  rooms:show <roomId>
  worktrees:clean
  config:validate

Common options:
  --dry-run
  --objective "..."
  --to <agent-id>
`.trim());
}
main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
