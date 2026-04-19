import fs from "node:fs/promises";
import path from "node:path";
import type { SkillCoreTool } from "./types.js";
import { resolveRequiredString, resolveWorkspacePath } from "./workspace-path.js";

type SkillCoreFileToolContext = {
  workspaceDir: string;
};

type ReadArgs = {
  path?: string;
  file_path?: string;
};

type WriteArgs = {
  path?: string;
  file_path?: string;
  content?: string;
};

type EditArgs = {
  path?: string;
  file_path?: string;
  oldText?: string;
  old_text?: string;
  newText?: string;
  new_text?: string;
};

/**
 * Creates package-owned read, write, and edit tools rooted at a workspace directory.
 * These tools intentionally enforce workspace-only access.
 */
export function createSkillCoreFileTools(
  context: SkillCoreFileToolContext,
): Array<SkillCoreTool<ReadArgs | WriteArgs | EditArgs, unknown>> {
  return [
    createReadTool(context),
    createWriteTool(context),
    createEditTool(context),
  ];
}

function createReadTool(context: SkillCoreFileToolContext): SkillCoreTool<ReadArgs, unknown> {
  return {
    name: "read",
    execute: async (_toolCallId, args) => {
      const resolvedPath = resolveWorkspacePath(context.workspaceDir, args?.path ?? args?.file_path);
      const content = await fs.readFile(resolvedPath, "utf8");
      return {
        path: resolvedPath,
        content,
      };
    },
  };
}

function createWriteTool(context: SkillCoreFileToolContext): SkillCoreTool<WriteArgs, unknown> {
  return {
    name: "write",
    execute: async (_toolCallId, args) => {
      const resolvedPath = resolveWorkspacePath(context.workspaceDir, args?.path ?? args?.file_path);
      const content = typeof args?.content === "string" ? args.content : "";
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, content, "utf8");
      return {
        path: resolvedPath,
        bytesWritten: Buffer.byteLength(content, "utf8"),
      };
    },
  };
}

function createEditTool(context: SkillCoreFileToolContext): SkillCoreTool<EditArgs, unknown> {
  return {
    name: "edit",
    execute: async (_toolCallId, args) => {
      const resolvedPath = resolveWorkspacePath(context.workspaceDir, args?.path ?? args?.file_path);
      const oldText = resolveRequiredString(args?.oldText ?? args?.old_text, "oldText");
      const newText = typeof (args?.newText ?? args?.new_text) === "string" ? (args?.newText ?? args?.new_text)! : "";
      const current = await fs.readFile(resolvedPath, "utf8");
      const index = current.indexOf(oldText);
      if (index < 0) {
        throw new Error(`Text not found in file: ${oldText}`);
      }
      const updated = `${current.slice(0, index)}${newText}${current.slice(index + oldText.length)}`;
      await fs.writeFile(resolvedPath, updated, "utf8");
      return {
        path: resolvedPath,
        replaced: 1,
      };
    },
  };
}
