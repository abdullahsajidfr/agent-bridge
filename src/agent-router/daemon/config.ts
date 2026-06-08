import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentRole, AgentType } from "../protocol/types";

export interface AgentRouterAgentConfig {
  enabled: boolean;
  command: string;
  args: string[];
  role: AgentRole;
  type?: AgentType;
  canEditFiles?: boolean;
  canRunShell?: boolean;
  supportsStreaming?: boolean;
  supportsSessionResume?: boolean;
  supportsStructuredOutput?: boolean;
}

export interface AgentRouterConfig {
  planner: string;
  repoPath: string;
  worktreesDir: string;
  dryRun?: boolean;
  agents: Record<string, AgentRouterAgentConfig>;
  policies: {
    requireHumanApprovalBeforeApply: boolean;
    allowSubagentShellCommands: boolean;
    allowSubagentGitCommands: boolean;
    maxConcurrentTasks: number;
    defaultTimeoutMs: number;
  };
}

export const AGENT_ROUTER_CONFIG_FILE = "agent-router.config.json";

export const DEFAULT_AGENT_ROUTER_CONFIG: AgentRouterConfig = {
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
      supportsStructuredOutput: true,
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
      supportsStructuredOutput: true,
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
      supportsStructuredOutput: true,
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
      supportsStructuredOutput: false,
    },
  },
  policies: {
    requireHumanApprovalBeforeApply: true,
    allowSubagentShellCommands: true,
    allowSubagentGitCommands: false,
    maxConcurrentTasks: 3,
    defaultTimeoutMs: 600000,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeAgentType(id: string, value: unknown): AgentType {
  if (value === "codex" || value === "cursor" || value === "gemini" || value === "copilot") return value;
  if (id === "codex" || id === "cursor" || id === "gemini" || id === "copilot") return id;
  return "gemini";
}

function normalizeRole(value: unknown, fallback: AgentRole): AgentRole {
  if (value === "planner" || value === "implementer" || value === "reviewer" || value === "tester") return value;
  return fallback;
}

export function normalizeRouterConfig(raw: unknown): AgentRouterConfig {
  if (!isRecord(raw)) return structuredClone(DEFAULT_AGENT_ROUTER_CONFIG);

  const defaults = DEFAULT_AGENT_ROUTER_CONFIG;
  const rawAgents = isRecord(raw.agents) ? raw.agents : {};
  const agents: Record<string, AgentRouterAgentConfig> = {};

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
      supportsStructuredOutput: asBoolean(rawAgent.supportsStructuredOutput, defaultAgent.supportsStructuredOutput ?? false),
    };
  }

  for (const [id, value] of Object.entries(rawAgents)) {
    if (agents[id] || !isRecord(value)) continue;
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
      supportsStructuredOutput: asBoolean(value.supportsStructuredOutput, false),
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
      defaultTimeoutMs: asInteger(rawPolicies.defaultTimeoutMs, defaults.policies.defaultTimeoutMs),
    },
  };
}

export class AgentRouterConfigService {
  constructor(private readonly cwd = process.cwd()) {}

  get configPath(): string {
    return resolve(this.cwd, AGENT_ROUTER_CONFIG_FILE);
  }

  hasConfig(): boolean {
    return existsSync(this.configPath);
  }

  load(): AgentRouterConfig {
    if (!this.hasConfig()) return structuredClone(DEFAULT_AGENT_ROUTER_CONFIG);
    const raw = JSON.parse(readFileSync(this.configPath, "utf-8"));
    return normalizeRouterConfig(raw);
  }

  init(): boolean {
    if (this.hasConfig()) return false;
    writeFileSync(this.configPath, JSON.stringify(DEFAULT_AGENT_ROUTER_CONFIG, null, 2) + "\n", "utf-8");
    return true;
  }

  validate(config = this.load()): string[] {
    const errors: string[] = [];
    if (!config.agents[config.planner]) errors.push(`Planner "${config.planner}" is not configured.`);
    if (config.policies.maxConcurrentTasks < 1) errors.push("policies.maxConcurrentTasks must be at least 1.");
    if (config.policies.defaultTimeoutMs < 1000) errors.push("policies.defaultTimeoutMs must be at least 1000.");
    for (const [id, agent] of Object.entries(config.agents)) {
      if (!agent.command.trim()) errors.push(`agents.${id}.command is required.`);
      if (!Array.isArray(agent.args)) errors.push(`agents.${id}.args must be an array.`);
    }
    return errors;
  }
}
