import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createHostBackedSkillCoreRuntime } from "./host-backed-runtime.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeWorkspace(): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-core-host-backed-"));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

async function writeSkill(workspaceDir: string, name: string, description: string): Promise<void> {
  const skillDir = path.join(workspaceDir, "skills", name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", `# ${name}`, description, ""].join(
      "\n",
    ),
    "utf8",
  );
}

describe("host-backed skill-core runtime", () => {
  it("assembles package tools with delegated host exec/process", async () => {
    const workspaceDir = await makeWorkspace();
    await writeSkill(workspaceDir, "build", "Build workspace");

    const hostExec = vi.fn(async () => ({ ok: true, source: "host-exec" }));
    const hostProcess = vi.fn(async () => ({ ok: true, source: "host-process" }));

    const runtime = createHostBackedSkillCoreRuntime({
      workspaceDir,
      hostTools: {
        listTools: async () => [
          { name: "exec", execute: hostExec },
          { name: "process", execute: hostProcess },
          { name: "browser", execute: vi.fn(async () => ({ ok: true })) },
        ],
      },
    });

    const tools = await runtime.listTools({ workspaceDir });
    expect(tools.map((tool) => tool.name)).toEqual(["read", "write", "edit", "exec", "process"]);

    const execTool = tools.find((tool) => tool.name === "exec");
    const processTool = tools.find((tool) => tool.name === "process");
    expect(execTool).toBeDefined();
    expect(processTool).toBeDefined();

    await expect(execTool?.execute("call-exec", { command: "pwd" })).resolves.toEqual({
      ok: true,
      source: "host-exec",
    });
    await expect(processTool?.execute("call-process", { action: "list" })).resolves.toEqual({
      ok: true,
      source: "host-process",
    });

    await expect(runtime.listSkillCommands(workspaceDir)).resolves.toEqual(["build"]);
  });

  it("replaces host apply_patch with package implementation when host exposes apply_patch", async () => {
    const workspaceDir = await makeWorkspace();

    const runtime = createHostBackedSkillCoreRuntime({
      workspaceDir,
      hostTools: {
        listTools: async () => [
          { name: "apply_patch", execute: vi.fn(async () => ({ ok: false })) },
        ],
      },
    });

    const tools = await runtime.listTools({ workspaceDir });
    expect(tools.map((tool) => tool.name)).toEqual(["read", "write", "edit", "apply_patch"]);

    const applyPatchTool = tools.find((tool) => tool.name === "apply_patch");
    expect(applyPatchTool).toBeDefined();

    await applyPatchTool?.execute("call-patch", {
      input: `*** Begin Patch
*** Add File: package-file.txt
+from-host-backed-runtime
*** End Patch`,
    });
    await expect(fs.readFile(path.join(workspaceDir, "package-file.txt"), "utf8")).resolves.toBe(
      "from-host-backed-runtime\n",
    );
  });

  it("honors an injected skill catalog override", async () => {
    const workspaceDir = await makeWorkspace();

    const runtime = createHostBackedSkillCoreRuntime({
      workspaceDir,
      hostTools: {
        listTools: async () => [],
      },
      skillCatalog: {
        listSkillCommandNames: async () => ["override-command"],
      },
    });

    await expect(runtime.listSkillCommands(workspaceDir)).resolves.toEqual(["override-command"]);
  });
});
