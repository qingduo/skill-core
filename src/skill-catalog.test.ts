import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildWorkspaceSkillCommandSpecs,
  createFilesystemSkillCatalog,
} from "./skill-catalog.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeWorkspace(): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-core-workspace-"));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

async function writeSkill(params: {
  workspaceDir: string;
  dirName: string;
  name: string;
  description: string;
  frontmatterExtra?: string;
}): Promise<void> {
  const skillDir = path.join(params.workspaceDir, "skills", params.dirName);
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

describe("skill-core skill catalog", () => {
  it("sanitizes, de-duplicates, and filters command specs", async () => {
    const workspaceDir = await makeWorkspace();
    await writeSkill({
      workspaceDir,
      dirName: "hello-world",
      name: "hello-world",
      description: "Hello world skill",
    });
    await writeSkill({
      workspaceDir,
      dirName: "hello_world",
      name: "hello_world",
      description: "Hello underscore skill",
    });
    await writeSkill({
      workspaceDir,
      dirName: "hidden",
      name: "hidden-skill",
      description: "Hidden skill",
      frontmatterExtra: "user-invocable: false",
    });
    await writeSkill({
      workspaceDir,
      dirName: "dispatch",
      name: "dispatch",
      description: "Dispatch via exec",
      frontmatterExtra: "command-dispatch: tool\ncommand-tool: exec",
    });

    const specs = await buildWorkspaceSkillCommandSpecs(workspaceDir, {
      reservedNames: new Set(["hello_world"]),
    });

    expect(specs.map((entry) => entry.name).toSorted()).toEqual([
      "dispatch",
      "hello_world_2",
      "hello_world_3",
    ]);
    expect(specs.find((entry) => entry.skillName === "hidden-skill")).toBeUndefined();
    expect(specs.find((entry) => entry.skillName === "dispatch")?.dispatch).toEqual({
      kind: "tool",
      toolName: "exec",
      argMode: "raw",
    });
  });

  it("lists command names through the package-local filesystem catalog", async () => {
    const workspaceDir = await makeWorkspace();
    await writeSkill({
      workspaceDir,
      dirName: "build",
      name: "build",
      description: "Build the workspace",
    });
    await writeSkill({
      workspaceDir,
      dirName: "test",
      name: "test",
      description: "Run workspace tests",
    });

    const catalog = createFilesystemSkillCatalog();
    await expect(catalog.listSkillCommandNames(workspaceDir)).resolves.toEqual(["build", "test"]);
  });
});
