import type { AgentTaskExpectedOutput } from "../protocol/types";

export interface PlannedAgentTask {
  to: string;
  objective: string;
  instructions?: string;
  expectedOutput?: AgentTaskExpectedOutput;
  canEditFiles?: boolean;
  canRunCommands?: boolean;
  constraints?: string[];
}

export interface ParsedAgentPlan {
  summary?: string;
  tasks: PlannedAgentTask[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asExpectedOutput(value: unknown): AgentTaskExpectedOutput | undefined {
  if (value === "patch" || value === "review" || value === "answer" || value === "test-report") return value;
  return undefined;
}

export function parseAgentPlan(text: string): ParsedAgentPlan {
  const json = parsePlanJson(text);
  if (json) return json;

  const tasks = parseLooseTasks(text);
  if (tasks.length) return { tasks };

  throw new Error("Planner output did not contain a parseable task plan.");
}

function parsePlanJson(text: string): ParsedAgentPlan | null {
  for (const candidate of jsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizePlan(parsed);
      if (normalized.tasks.length) return normalized;
    } catch {}
  }
  return null;
}

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = new Set<string>();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) candidates.add(trimmed);

  const fencedJson = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of trimmed.matchAll(fencedJson)) {
    const body = match[1]?.trim();
    if (body) candidates.add(body);
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.add(trimmed.slice(objectStart, objectEnd + 1));

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.add(trimmed.slice(arrayStart, arrayEnd + 1));

  for (const line of trimmed.split("\n")) {
    try {
      collectJsonStrings(JSON.parse(line), candidates);
    } catch {}
  }

  return [...candidates];
}

function collectJsonStrings(value: unknown, candidates: Set<string>): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) candidates.add(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, candidates);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) collectJsonStrings(item, candidates);
  }
}

function normalizePlan(value: unknown): ParsedAgentPlan {
  const tasksValue = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.tasks)
      ? value.tasks
      : [];

  const tasks = tasksValue
    .map(normalizeTask)
    .filter((task): task is PlannedAgentTask => Boolean(task));

  return {
    summary: isRecord(value) ? asString(value.summary) : undefined,
    tasks,
  };
}

function normalizeTask(value: unknown): PlannedAgentTask | null {
  if (!isRecord(value)) return null;

  const to = asString(value.to ?? value.agent ?? value.assignee);
  const objective = asString(value.objective ?? value.title ?? value.task);
  if (!to || !objective) return null;

  return {
    to,
    objective,
    instructions: asString(value.instructions ?? value.prompt ?? value.details) ?? objective,
    expectedOutput: asExpectedOutput(value.expectedOutput ?? value.expected_output),
    canEditFiles: asBoolean(value.canEditFiles ?? value.can_edit_files),
    canRunCommands: asBoolean(value.canRunCommands ?? value.can_run_commands),
    constraints: asStringArray(value.constraints),
  };
}

function parseLooseTasks(text: string): PlannedAgentTask[] {
  const tasks: PlannedAgentTask[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*]|\d+[.)])\s*(?:\[(?<agent>[a-zA-Z0-9_-]+)\]|(?<agent2>codex|cursor|gemini|copilot)\s*[:\-])\s*(?<objective>.+)$/i);
    if (!match?.groups) continue;
    const to = (match.groups.agent ?? match.groups.agent2)?.toLowerCase();
    const objective = match.groups.objective?.trim();
    if (!to || !objective) continue;
    tasks.push({ to, objective, instructions: objective });
  }

  return tasks;
}
