#!/usr/bin/env bun

import { AgentRouterConfigService } from "./daemon/config";
import { AgentRegistry } from "./daemon/registry";
import { AgentRouter } from "./daemon/router";
import { AgentRouterStateStore } from "./daemon/state-store";
import { createConfiguredAdapters } from "./adapters";
import { DiffCollector } from "./supervisor/diff-collector";
import { WorktreeManager } from "./supervisor/worktree-manager";

const args = process.argv.slice(2);
const command = args[0];
const rest = args.slice(1);

async function main() {
  const configService = new AgentRouterConfigService();

  switch (command) {
    case "init": {
      const created = configService.init();
      console.log(created ? `Created ${configService.configPath}` : `${configService.configPath} already exists`);
      return;
    }
    case "config:validate": {
      const errors = configService.validate();
      if (errors.length) {
        console.error(errors.join("\n"));
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
        expectedOutput: options["expected-output"] as any,
        canEditFiles: parseBooleanOption(options, "edit"),
        canRunCommands: parseBooleanOption(options, "commands"),
        dryRun: options["dry-run"] === "true" || config.dryRun,
      });
      saveRuntimeState(router);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "task:review": {
      const options = parseOptions(rest);
      const to = options.to ?? "copilot";
      const { router, config } = loadRuntime(configService, options["dry-run"] === "true");
      const instructions = options.diff
        ? buildDiffReviewInstructions(config.repoPath, options.instructions)
        : options.instructions;
      const result = await router.assign({
        to,
        objective: options.objective ?? "Review the current diff and report risks.",
        instructions,
        expectedOutput: "review",
        canEditFiles: false,
        canRunCommands: true,
        dryRun: options["dry-run"] === "true",
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
      const result = options.execute === "true"
        ? await router.runPlanAndDispatch(planner, objective, options["dry-run"] === "true" || config.dryRun)
        : await router.runPlan(planner, objective);
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
      if (!roomId) throw new Error("rooms:show requires <roomId>.");
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

function loadRuntime(configService: AgentRouterConfigService, dryRunOverride = false) {
  const config = configService.load();
  if (dryRunOverride) config.dryRun = true;
  const state = new AgentRouterStateStore().load();
  const registry = new AgentRegistry();
  for (const adapter of createConfiguredAdapters(config)) registry.register(adapter);
  return { config, registry, router: new AgentRouter(config, registry, state) };
}

function saveRuntimeState(router: AgentRouter) {
  new AgentRouterStateStore().save({
    rooms: router.rooms.list(),
    tasks: router.tasks.list(),
  });
}

function parseOptions(values: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
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

function requireOption(options: Record<string, string>, key: string): string {
  const value = options[key];
  if (!value) throw new Error(`Missing required --${key} option.`);
  return value;
}

function parseBooleanOption(options: Record<string, string>, key: string): boolean | undefined {
  if (!(key in options)) return undefined;
  return options[key] === "true";
}

function buildDiffReviewInstructions(repoPath: string, extraInstructions?: string): string {
  const { changedFiles, diff } = new DiffCollector().collect(repoPath);
  return [
    extraInstructions ?? "Review the repository diff and return a structured review result.",
    "",
    `Changed files (${changedFiles.length}):`,
    changedFiles.length ? changedFiles.map((file) => `- ${file}`).join("\n") : "- none",
    "",
    "Diff:",
    diff || "(no diff)",
  ].join("\n");
}

function printHelp() {
  console.log(`
AgentRouter — local multi-agent coding orchestration

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
