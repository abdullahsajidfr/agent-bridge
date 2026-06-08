import type { AgentAdapter } from "../protocol/types";

export class AgentRegistry {
  private readonly agents = new Map<string, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    this.agents.set(adapter.id, adapter);
  }

  get(id: string): AgentAdapter | undefined {
    return this.agents.get(id);
  }

  list(): AgentAdapter[] {
    return [...this.agents.values()];
  }
}
