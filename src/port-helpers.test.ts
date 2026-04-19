import { describe, expect, it } from "vitest";
import {
  createNoopSkillEnvPolicy,
  createSkillCoreToolProvider,
  createStaticSkillCatalog,
} from "./port-helpers.js";

describe("skill-core port helpers", () => {
  it("creates a tool provider from a listTools callback", async () => {
    const provider = createSkillCoreToolProvider({
      listTools: async () => [{ name: "read", execute: async () => ({ ok: true }) }],
    });

    const tools = await provider.listTools({ workspaceDir: "/tmp/workspace" });
    expect(tools.map((tool) => tool.name)).toEqual(["read"]);
  });

  it("creates a static skill catalog", async () => {
    const catalog = createStaticSkillCatalog(["build", "test"]);
    await expect(catalog.listSkillCommandNames("/tmp/workspace")).resolves.toEqual([
      "build",
      "test",
    ]);
  });

  it("creates a no-op env policy", async () => {
    const envPolicy = createNoopSkillEnvPolicy();
    await expect(envPolicy.applyEnvPolicy({ PATH: "/usr/bin" })).resolves.toEqual({
      PATH: "/usr/bin",
    });
  });
});
