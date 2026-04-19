import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSkillCoreFileTools } from "./file-tools.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeWorkspace(): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-core-files-"));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

describe("skill-core file tools", () => {
  it("reads, writes, and edits files under the workspace root", async () => {
    const workspaceDir = await makeWorkspace();
    const tools = createSkillCoreFileTools({ workspaceDir });
    const readTool = tools.find((entry) => entry.name === "read");
    const writeTool = tools.find((entry) => entry.name === "write");
    const editTool = tools.find((entry) => entry.name === "edit");
    expect(readTool).toBeDefined();
    expect(writeTool).toBeDefined();
    expect(editTool).toBeDefined();

    await writeTool!.execute("call-write", {
      path: "notes.txt",
      content: "hello world",
    });
    await expect(fs.readFile(path.join(workspaceDir, "notes.txt"), "utf8")).resolves.toBe(
      "hello world",
    );

    const readResult = (await readTool!.execute("call-read", { path: "notes.txt" })) as {
      content?: string;
    };
    expect(readResult.content).toBe("hello world");

    await editTool!.execute("call-edit", {
      path: "notes.txt",
      oldText: "world",
      newText: "skill-core",
    });
    await expect(fs.readFile(path.join(workspaceDir, "notes.txt"), "utf8")).resolves.toBe(
      "hello skill-core",
    );
  });

  it("rejects paths that escape the workspace root", async () => {
    const workspaceDir = await makeWorkspace();
    const tools = createSkillCoreFileTools({ workspaceDir });
    const readTool = tools.find((entry) => entry.name === "read");
    expect(readTool).toBeDefined();

    await expect(readTool!.execute("call-escape", { path: "../secret.txt" })).rejects.toThrow(
      /Path escapes workspace root/i,
    );
  });
});
