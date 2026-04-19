import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSkillCoreApplyPatchTool } from "./apply-patch-tool.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeWorkspace(): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-core-patch-"));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

describe("skill-core apply_patch tool", () => {
  it("adds, updates, and deletes files within the workspace", async () => {
    const workspaceDir = await makeWorkspace();
    const tool = createSkillCoreApplyPatchTool({ workspaceDir });

    await tool.execute(
      "call-add",
      {
        input: `*** Begin Patch
*** Add File: notes.txt
+hello world
*** End Patch`,
      },
    );
    await expect(fs.readFile(path.join(workspaceDir, "notes.txt"), "utf8")).resolves.toBe(
      "hello world\n",
    );

    await tool.execute(
      "call-update",
      {
        input: `*** Begin Patch
*** Update File: notes.txt
@@
-hello world
+hello apply patch
*** End Patch`,
      },
    );
    await expect(fs.readFile(path.join(workspaceDir, "notes.txt"), "utf8")).resolves.toBe(
      "hello apply patch\n",
    );

    await tool.execute(
      "call-delete",
      {
        input: `*** Begin Patch
*** Delete File: notes.txt
*** End Patch`,
      },
    );
    await expect(fs.stat(path.join(workspaceDir, "notes.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects patch paths that escape the workspace root", async () => {
    const workspaceDir = await makeWorkspace();
    const tool = createSkillCoreApplyPatchTool({ workspaceDir });

    await expect(
      tool.execute("call-escape", {
        input: `*** Begin Patch
*** Add File: ../evil.txt
+owned
*** End Patch`,
      }),
    ).rejects.toThrow(/Path escapes workspace root/i);
  });
});
