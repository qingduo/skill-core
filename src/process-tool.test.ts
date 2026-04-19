import { afterEach, describe, expect, it } from "vitest";
import { createSkillCoreExecTool } from "./exec-tool.js";
import { SkillCoreProcessRegistry } from "./process-registry.js";
import { createSkillCoreProcessTool } from "./process-tool.js";

const trackedIds: string[] = [];

afterEach(() => {
  for (const id of trackedIds.splice(0, trackedIds.length)) {
    try {
      process.kill(Number(id));
    } catch {
      // Ignore already-exited children.
    }
  }
});

describe("skill-core process tool", () => {
  it("lists and kills background processes tracked by package exec", async () => {
    const registry = new SkillCoreProcessRegistry();
    const execTool = createSkillCoreExecTool({
      workspaceDir: process.cwd(),
      registry,
    });
    const processTool = createSkillCoreProcessTool({ registry });

    const command = `${JSON.stringify(process.execPath)} -e "setInterval(() => {}, 1000)"`;
    const started = (await execTool.execute("call-bg", {
      command,
      background: true,
    })) as { processId?: string };

    expect(started.processId).toBeTruthy();
    trackedIds.push(String(started.processId));

    const listed = (await processTool.execute("call-list", {
      action: "list",
    })) as { processes?: Array<{ id: string }> };
    expect(listed.processes?.some((entry) => entry.id === started.processId)).toBe(true);

    const killed = (await processTool.execute("call-kill", {
      action: "kill",
      id: started.processId,
    })) as { killed?: boolean };
    expect(killed.killed).toBe(true);
  });

  it("tracks process completion and prunes completed entries", async () => {
    const registry = new SkillCoreProcessRegistry();
    const execTool = createSkillCoreExecTool({
      workspaceDir: process.cwd(),
      registry,
    });
    const processTool = createSkillCoreProcessTool({ registry });

    const command = `${JSON.stringify(process.execPath)} -e "setTimeout(() => process.exit(0), 50)"`;
    const started = (await execTool.execute("call-bg-short", {
      command,
      background: true,
    })) as { processId?: string };

    expect(started.processId).toBeTruthy();
    await waitForProcessExit(processTool, String(started.processId));

    const resolved = (await processTool.execute("call-get", {
      action: "get",
      id: started.processId,
    })) as { process?: { status?: string; completedAt?: number | undefined } | null };
    expect(resolved.process?.status).toBe("exited");
    expect(typeof resolved.process?.completedAt).toBe("number");

    const pruned = (await processTool.execute("call-prune", {
      action: "prune",
    })) as { removed?: number };
    expect(pruned.removed).toBe(1);
  });
});

async function waitForProcessExit(
  processTool: ReturnType<typeof createSkillCoreProcessTool>,
  id: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const current = (await processTool.execute("call-poll", {
      action: "get",
      id,
    })) as { process?: { status?: string } | null };
    if (current.process?.status && current.process.status !== "running") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for process ${id} to finish`);
}
