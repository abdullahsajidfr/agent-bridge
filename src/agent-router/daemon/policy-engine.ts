import type { AgentRouterConfig } from "./config";
import type { AgentTask } from "../protocol/types";

export class PolicyEngine {
  constructor(private readonly config: AgentRouterConfig) {}

  validateTask(task: AgentTask): string[] {
    const errors: string[] = [];
    if (task.canRunCommands && !this.config.policies.allowSubagentShellCommands) {
      errors.push("Shell commands are disabled by policy.");
    }
    if (task.canRunCommands && !this.config.policies.allowSubagentGitCommands) {
      const constraints = task.constraints.join("\n").toLowerCase();
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
