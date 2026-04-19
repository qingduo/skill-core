import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createStandaloneSkillCoreRuntime } from "./standalone-runtime.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeWorkspace(): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-core-standalone-"));
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

describe("standalone skill-core runtime", () => {
  it("works with package-owned file tools and filesystem skill catalog", async () => {
    const workspaceDir = await makeWorkspace();
    await writeSkill(workspaceDir, "build", "Build workspace");

    const runtime = createStandaloneSkillCoreRuntime({
      workspaceDir,
    });

    const tools = await runtime.listTools({ workspaceDir });
    expect(tools.map((tool) => tool.name)).toEqual([
      "read",
      "write",
      "edit",
      "apply_patch",
      "exec",
      "process",
    ]);

    const writeTool = tools.find((tool) => tool.name === "write");
    const readTool = tools.find((tool) => tool.name === "read");
    const applyPatchTool = tools.find((tool) => tool.name === "apply_patch");
    const execTool = tools.find((tool) => tool.name === "exec");
    const processTool = tools.find((tool) => tool.name === "process");
    expect(writeTool).toBeDefined();
    expect(readTool).toBeDefined();
    expect(applyPatchTool).toBeDefined();
    expect(execTool).toBeDefined();
    expect(processTool).toBeDefined();

    await writeTool!.execute("call-write", {
      path: "standalone.txt",
      content: "standalone runtime",
    });
    const readResult = (await readTool!.execute("call-read", {
      path: "standalone.txt",
    })) as { content?: string };
    expect(readResult.content).toBe("standalone runtime");

    await applyPatchTool!.execute("call-patch", {
      input: `*** Begin Patch
*** Update File: standalone.txt
@@
-standalone runtime
+standalone runtime patched
*** End Patch`,
    });
    await expect(fs.readFile(path.join(workspaceDir, "standalone.txt"), "utf8")).resolves.toBe(
      "standalone runtime patched\n",
    );

    const execResult = (await execTool!.execute("call-exec", {
      command: process.platform === "win32" ? "cd" : "pwd",
    })) as { stdout?: string };
    const [resolvedOutput, resolvedWorkspace] = await Promise.all([
      fs.realpath(execResult.stdout?.trim() ?? ""),
      fs.realpath(workspaceDir),
    ]);
    expect(resolvedOutput).toBe(resolvedWorkspace);

    await expect(runtime.listSkillCommands(workspaceDir)).resolves.toEqual(["build"]);
  });
});
