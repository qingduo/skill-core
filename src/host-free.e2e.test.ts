import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createStandaloneSkillCoreRuntime } from "./standalone-runtime.js";
import { buildWorkspaceSkillCommandSpecs } from "./skill-catalog.js";
import { resolveSkillCommandInvocation } from "./skill-invocation.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("host-free skill-core e2e", () => {
  it("runs workspace skills and core tools without any main-repo adapter", async () => {
    const workspaceDir = await makeWorkspace();
    await writeSkill({
      workspaceDir,
      name: "dispatch",
      description: "Dispatch a raw command through exec",
      frontmatterExtra: "command-dispatch: tool\ncommand-tool: exec",
    });
    await fs.writeFile(path.join(workspaceDir, "artifact.txt"), "seed\n", "utf8");

    const runtime = createStandaloneSkillCoreRuntime({
      workspaceDir,
    });

    await expect(runtime.listSkillCommands(workspaceDir)).resolves.toEqual(["dispatch"]);

    const commandSpecs = await buildWorkspaceSkillCommandSpecs(workspaceDir);
    const invocation = resolveSkillCommandInvocation({
      commandBodyNormalized: process.platform === "win32" ? "/dispatch cd" : "/dispatch pwd",
      skillCommands: commandSpecs,
    });
    expect(invocation?.command.dispatch).toEqual({
      kind: "tool",
      toolName: "exec",
      argMode: "raw",
    });

    const dispatchResult = (await runtime.dispatchTool({
      context: { workspaceDir },
      toolName: invocation!.command.dispatch!.toolName,
      toolCallId: "dispatch-call-1",
      command: invocation?.args ?? "",
      commandName: invocation!.command.name,
      skillName: invocation!.command.skillName,
    })) as { stdout?: string };
    const [resolvedOutput, resolvedWorkspace] = await Promise.all([
      fs.realpath(dispatchResult.stdout?.trim() ?? ""),
      fs.realpath(workspaceDir),
    ]);
    expect(resolvedOutput).toBe(resolvedWorkspace);

    await runtime.executeToolCall({
      context: { workspaceDir },
      toolName: "apply_patch",
      toolCallId: "patch-call-1",
      args: {
        input: `*** Begin Patch
*** Update File: artifact.txt
@@
-seed
+patched
*** End Patch`,
      },
    });

    const readResult = (await runtime.executeToolCall({
      context: { workspaceDir },
      toolName: "read",
      toolCallId: "read-call-1",
      args: { path: "artifact.txt" },
    })) as { content?: string };
    expect(readResult.content).toBe("patched\n");

    const backgroundCommand =
      process.platform === "win32" ? "timeout /t 30 >NUL" : "sleep 30";
    const execResult = (await runtime.executeToolCall({
      context: { workspaceDir },
      toolName: "exec",
      toolCallId: "exec-call-1",
      args: {
        command: backgroundCommand,
        background: true,
      },
    })) as { processId?: string };
    expect(execResult.processId).toBeTruthy();

    const processBeforeKill = (await runtime.executeToolCall({
      context: { workspaceDir },
      toolName: "process",
      toolCallId: "process-call-1",
      args: {
        action: "get",
        id: execResult.processId,
      },
    })) as { process?: { status?: string } | null };
    expect(processBeforeKill.process?.status).toBe("running");

    const killResult = (await runtime.executeToolCall({
      context: { workspaceDir },
      toolName: "process",
      toolCallId: "process-call-2",
      args: {
        action: "kill",
        id: execResult.processId,
      },
    })) as { killed?: boolean };
    expect(killResult.killed).toBe(true);
  });
});

async function makeWorkspace(): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-core-e2e-"));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

async function writeSkill(params: {
  workspaceDir: string;
  name: string;
  description: string;
  frontmatterExtra?: string;
}): Promise<void> {
  const skillDir = path.join(params.workspaceDir, "skills", params.name);
  await fs.mkdir(skillDir, { recursive: true });
  const source = [
    "---",
    `name: ${params.name}`,
    `description: ${params.description}`,
    params.frontmatterExtra?.trim() ?? "",
    "---",
    `# ${params.name}`,
    params.description,
    "",
  ]
    .filter(Boolean)
    .join("\n");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), source, "utf8");
}
