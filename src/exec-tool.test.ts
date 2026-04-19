import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSkillCoreExecTool } from "./exec-tool.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeWorkspace(): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-core-exec-"));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

describe("skill-core exec tool", () => {
  it("runs foreground commands in the workspace by default", async () => {
    const workspaceDir = await makeWorkspace();
    const tool = createSkillCoreExecTool({ workspaceDir });

    const result = (await tool.execute("call-exec", {
      command: process.platform === "win32" ? "cd" : "pwd",
    })) as {
      stdout?: string;
      details?: { cwd?: string };
    };

    expect(result.details?.cwd).toBe(workspaceDir);
    const [resolvedOutput, resolvedWorkspace] = await Promise.all([
      fs.realpath(result.stdout?.trim() ?? ""),
      fs.realpath(workspaceDir),
    ]);
    expect(resolvedOutput).toBe(resolvedWorkspace);
  });

  it("rejects workdirs that escape the workspace root", async () => {
    const workspaceDir = await makeWorkspace();
    const tool = createSkillCoreExecTool({ workspaceDir });

    await expect(
      tool.execute("call-escape", {
        command: process.platform === "win32" ? "echo hi" : "printf hi",
        workdir: "../outside",
      }),
    ).rejects.toThrow(/Path escapes workspace root/i);
  });
});
