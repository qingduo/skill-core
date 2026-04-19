import { describe, expect, it, vi } from "vitest";
import { createDelegatingSkillCoreTool } from "./delegating-tools.js";

describe("delegating skill-core tools", () => {
  it("delegates exec execution to the host implementation", async () => {
    const execute = vi.fn(async () => ({ ok: true, source: "host-exec" }));
    const tool = createDelegatingSkillCoreTool({
      name: "exec",
      delegate: {
        name: "exec",
        execute,
      },
    });

    await expect(tool.execute("call-exec", { command: "pwd" })).resolves.toEqual({
      ok: true,
      source: "host-exec",
    });
    expect(execute).toHaveBeenCalledWith("call-exec", { command: "pwd" }, undefined);
  });

  it("delegates process execution to the host implementation", async () => {
    const execute = vi.fn(async () => ({ ok: true, source: "host-process" }));
    const tool = createDelegatingSkillCoreTool({
      name: "process",
      delegate: {
        name: "process",
        execute,
      },
    });

    await expect(tool.execute("call-process", { action: "list" })).resolves.toEqual({
      ok: true,
      source: "host-process",
    });
    expect(execute).toHaveBeenCalledWith("call-process", { action: "list" }, undefined);
  });
});
