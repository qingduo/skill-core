import { describe, expect, it } from "vitest";
import { resolveSkillCommandInvocation } from "./skill-invocation.js";

describe("skill-core command invocation", () => {
  it("matches a direct command and parses args", () => {
    const invocation = resolveSkillCommandInvocation({
      commandBodyNormalized: "/demo_skill do the thing",
      skillCommands: [{ name: "demo_skill", skillName: "demo-skill", description: "Demo" }],
    });

    expect(invocation?.command.skillName).toBe("demo-skill");
    expect(invocation?.args).toBe("do the thing");
  });

  it("supports /skill with normalized name lookup", () => {
    const invocation = resolveSkillCommandInvocation({
      commandBodyNormalized: "/skill demo-skill extra args",
      skillCommands: [{ name: "demo_skill", skillName: "demo-skill", description: "Demo" }],
    });

    expect(invocation?.command.name).toBe("demo_skill");
    expect(invocation?.args).toBe("extra args");
  });

  it("returns null for unknown commands", () => {
    const invocation = resolveSkillCommandInvocation({
      commandBodyNormalized: "/unknown arg",
      skillCommands: [{ name: "demo_skill", skillName: "demo-skill", description: "Demo" }],
    });

    expect(invocation).toBeNull();
  });
});
