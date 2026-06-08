import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Room, TaskRecord } from "../protocol/types";

export interface AgentRouterState {
  rooms: Room[];
  tasks: TaskRecord[];
}

export class AgentRouterStateStore {
  constructor(private readonly statePath = resolve(process.cwd(), ".agent-router", "state.json")) {}

  load(): AgentRouterState {
    try {
      if (!existsSync(this.statePath)) return { rooms: [], tasks: [] };
      const parsed = JSON.parse(readFileSync(this.statePath, "utf-8"));
      return {
        rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      };
    } catch {
      return { rooms: [], tasks: [] };
    }
  }

  save(state: AgentRouterState): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  }
}
