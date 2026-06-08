import { describe, expect, test } from "bun:test";
import { parseAgentPlan } from "../agent-router/daemon/plan-parser";

describe("parseAgentPlan", () => {
  test("parses strict JSON plan objects", () => {
    const plan = parseAgentPlan(JSON.stringify({
      summary: "Do two tasks",
      tasks: [
        {
          to: "gemini",
          objective: "Implement feature",
          instructions: "Change code",
          expectedOutput: "patch",
          canEditFiles: true,
          canRunCommands: true,
          constraints: ["No git commands"],
        },
      ],
    }));

    expect(plan.summary).toBe("Do two tasks");
    expect(plan.tasks[0].to).toBe("gemini");
    expect(plan.tasks[0].expectedOutput).toBe("patch");
  });

  test("parses fenced JSON plan output", () => {
    const plan = parseAgentPlan([
      "Here is the plan:",
      "```json",
      JSON.stringify({ tasks: [{ to: "copilot", objective: "Review diff" }] }),
      "```",
    ].join("\n"));

    expect(plan.tasks[0].to).toBe("copilot");
    expect(plan.tasks[0].objective).toBe("Review diff");
  });

  test("parses JSON embedded inside JSONL strings", () => {
    const jsonPlan = JSON.stringify({ tasks: [{ to: "cursor", objective: "Refactor module" }] });
    const jsonl = [
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "agent.message", content: jsonPlan }),
    ].join("\n");

    const plan = parseAgentPlan(jsonl);

    expect(plan.tasks[0].to).toBe("cursor");
    expect(plan.tasks[0].objective).toBe("Refactor module");
  });

  test("falls back to simple markdown assignments", () => {
    const plan = parseAgentPlan("- gemini: Implement parser\n- [copilot] Review changes");

    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].to).toBe("gemini");
    expect(plan.tasks[1].to).toBe("copilot");
  });
});
