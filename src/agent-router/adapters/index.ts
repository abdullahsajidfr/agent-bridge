import type { AgentAdapter, AgentType } from "../protocol/types";
import type { AgentRouterConfig } from "../daemon/config";
import { CliAgentAdapter } from "./cli-agent-adapter";

export function createConfiguredAdapters(config: AgentRouterConfig): AgentAdapter[] {
  return Object.entries(config.agents)
    .filter(([, agent]) => agent.enabled)
    .map(([id, agent]) => new CliAgentAdapter({
      id,
      type: (agent.type ?? id) as AgentType,
      config: agent,
      dryRun: config.dryRun,
    }));
}
