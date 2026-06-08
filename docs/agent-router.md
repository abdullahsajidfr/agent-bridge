# AgentRouter

AgentRouter is an experimental local multi-agent orchestration layer for AgentBridge. The existing Claude/Codex bridge remains unchanged; the router lives under `src/agent-router` and exposes a separate `agent-router` CLI.

## Roles

- Codex is the planner, orchestrator, and final integrator.
- Cursor, Gemini, and Copilot CLI are adapters that can implement, review, or test.
- The daemon/router layer routes tasks and records structured task results. It is not the planning brain.
- File-editing tasks use isolated git worktrees so subagent changes stay out of the main working tree until a human approves them.

## Configure

Create or edit `agent-router.config.json`:

```json
{
  "planner": "codex",
  "repoPath": ".",
  "worktreesDir": "../.agent-worktrees",
  "agents": {
    "gemini": {
      "enabled": true,
      "command": "gemini",
      "args": ["-p"],
      "role": "implementer"
    }
  },
  "policies": {
    "requireHumanApprovalBeforeApply": true,
    "allowSubagentShellCommands": true,
    "allowSubagentGitCommands": false,
    "maxConcurrentTasks": 3,
    "defaultTimeoutMs": 600000
  }
}
```

Binary names and flags are intentionally config-driven. Override `command` and `args` for your machine instead of changing source code.

## Commands

```sh
agent-router init
agent-router config:validate
agent-router agents:list
agent-router agents:status
agent-router task:assign --to gemini --objective "Implement the parser" --dry-run
agent-router task:review --to copilot --diff
agent-router task:run-plan --planner codex --objective "Add login tests"
agent-router rooms:list
agent-router rooms:show <roomId>
agent-router worktrees:clean
```

## Result Schema

Every adapter is prompted to return JSON:

```json
{
  "status": "success",
  "summary": "What changed or what was reviewed.",
  "changedFiles": ["src/example.ts"],
  "diff": "unified diff",
  "commandsRun": [{ "command": "bun test", "exitCode": 0 }],
  "testsRun": [{ "command": "bun test", "passed": true }],
  "risks": [],
  "questions": []
}
```

If an adapter returns plain text, AgentRouter still records stdout/stderr, command status, changed files, and git diff.

## Orchestration Flow

1. Run `task:run-plan` to ask Codex for a delegation plan.
2. Assign implementation tasks to Cursor or Gemini with `task:assign`.
3. Assign review or test tasks to Copilot CLI or Gemini.
4. Inspect structured results and worktree diffs.
5. Apply final changes to the main working tree only after human approval.
