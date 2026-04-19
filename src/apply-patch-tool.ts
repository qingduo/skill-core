import fs from "node:fs/promises";
import path from "node:path";
import { applyUpdateHunk, type UpdateFileChunk } from "./apply-patch-update.js";
import type { SkillCoreTool } from "./types.js";
import { resolveWorkspacePath } from "./workspace-path.js";

const BEGIN_PATCH_MARKER = "*** Begin Patch";
const END_PATCH_MARKER = "*** End Patch";
const ADD_FILE_MARKER = "*** Add File: ";
const DELETE_FILE_MARKER = "*** Delete File: ";
const UPDATE_FILE_MARKER = "*** Update File: ";
const MOVE_TO_MARKER = "*** Move to: ";
const EOF_MARKER = "*** End of File";

type AddFileHunk = {
  kind: "add";
  path: string;
  contents: string;
};

type DeleteFileHunk = {
  kind: "delete";
  path: string;
};

type UpdateFileHunk = {
  kind: "update";
  path: string;
  movePath?: string;
  chunks: UpdateFileChunk[];
};

type PatchHunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;

type ApplyPatchArgs = {
  input?: string;
};

/**
 * Creates a package-owned apply_patch tool rooted at the workspace directory.
 */
export function createSkillCoreApplyPatchTool(params: {
  workspaceDir: string;
}): SkillCoreTool<ApplyPatchArgs, unknown> {
  return {
    name: "apply_patch",
    execute: async (_toolCallId, args) => {
      const input = args?.input?.trim();
      if (!input) {
        throw new Error("Provide a patch input.");
      }
      const hunks = parsePatchText(input);
      const summary = {
        added: [] as string[],
        modified: [] as string[],
        deleted: [] as string[],
      };

      for (const hunk of hunks) {
        if (hunk.kind === "add") {
          const filePath = resolveWorkspacePath(params.workspaceDir, hunk.path);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, hunk.contents, "utf8");
          summary.added.push(path.relative(params.workspaceDir, filePath));
          continue;
        }

        if (hunk.kind === "delete") {
          const filePath = resolveWorkspacePath(params.workspaceDir, hunk.path);
          await fs.rm(filePath, { force: true });
          summary.deleted.push(path.relative(params.workspaceDir, filePath));
          continue;
        }

        const filePath = resolveWorkspacePath(params.workspaceDir, hunk.path);
        const updated = await applyUpdateHunk(filePath, hunk.chunks);
        if (hunk.movePath) {
          const movePath = resolveWorkspacePath(params.workspaceDir, hunk.movePath);
          await fs.mkdir(path.dirname(movePath), { recursive: true });
          await fs.writeFile(movePath, updated, "utf8");
          await fs.rm(filePath, { force: true });
          summary.modified.push(path.relative(params.workspaceDir, movePath));
          continue;
        }
        await fs.writeFile(filePath, updated, "utf8");
        summary.modified.push(path.relative(params.workspaceDir, filePath));
      }

      return {
        content: [{ type: "text", text: formatSummary(summary) }],
        details: { summary },
      };
    },
  };
}

function formatSummary(summary: {
  added: string[];
  modified: string[];
  deleted: string[];
}): string {
  const lines = ["Success. Updated the following files:"];
  for (const file of summary.added) {
    lines.push(`A ${file}`);
  }
  for (const file of summary.modified) {
    lines.push(`M ${file}`);
  }
  for (const file of summary.deleted) {
    lines.push(`D ${file}`);
  }
  return lines.join("\n");
}

function parsePatchText(input: string): PatchHunk[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== BEGIN_PATCH_MARKER || lines[lines.length - 1] !== END_PATCH_MARKER) {
    throw new Error("Invalid patch markers.");
  }

  const hunks: PatchHunk[] = [];
  let index = 1;
  while (index < lines.length - 1) {
    const line = lines[index] ?? "";
    if (line.startsWith(ADD_FILE_MARKER)) {
      const filePath = line.slice(ADD_FILE_MARKER.length).trim();
      index += 1;
      const addLines: string[] = [];
      while (index < lines.length - 1 && !isHunkHeader(lines[index] ?? "")) {
        const current = lines[index] ?? "";
        if (!current.startsWith("+")) {
          throw new Error(`Invalid add-file line: ${current}`);
        }
        addLines.push(current.slice(1));
        index += 1;
      }
      hunks.push({
        kind: "add",
        path: filePath,
        contents: `${addLines.join("\n")}\n`,
      });
      continue;
    }

    if (line.startsWith(DELETE_FILE_MARKER)) {
      hunks.push({
        kind: "delete",
        path: line.slice(DELETE_FILE_MARKER.length).trim(),
      });
      index += 1;
      continue;
    }

    if (line.startsWith(UPDATE_FILE_MARKER)) {
      const filePath = line.slice(UPDATE_FILE_MARKER.length).trim();
      index += 1;
      let movePath: string | undefined;
      if ((lines[index] ?? "").startsWith(MOVE_TO_MARKER)) {
        movePath = (lines[index] ?? "").slice(MOVE_TO_MARKER.length).trim();
        index += 1;
      }
      const chunks: UpdateFileChunk[] = [];
      while (index < lines.length - 1 && !isHunkHeader(lines[index] ?? "")) {
        const header = lines[index] ?? "";
        if (!header.startsWith("@@")) {
          throw new Error(`Invalid update chunk header: ${header}`);
        }
        const changeContext = header === "@@" ? undefined : header.slice(3).trim() || undefined;
        index += 1;
        const oldLines: string[] = [];
        const newLines: string[] = [];
        let isEndOfFile = false;
        while (index < lines.length - 1 && !isChunkBoundary(lines[index] ?? "")) {
          const current = lines[index] ?? "";
          if (current === EOF_MARKER) {
            isEndOfFile = true;
            index += 1;
            break;
          }
          const prefix = current[0];
          const value = current.slice(1);
          if (prefix === " ") {
            oldLines.push(value);
            newLines.push(value);
          } else if (prefix === "-") {
            oldLines.push(value);
          } else if (prefix === "+") {
            newLines.push(value);
          } else {
            throw new Error(`Invalid update line: ${current}`);
          }
          index += 1;
        }
        chunks.push({ changeContext, oldLines, newLines, isEndOfFile });
      }
      hunks.push({ kind: "update", path: filePath, ...(movePath ? { movePath } : {}), chunks });
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }
    throw new Error(`Invalid patch hunk header: ${line}`);
  }

  return hunks;
}

function isHunkHeader(line: string): boolean {
  return (
    line.startsWith(ADD_FILE_MARKER) ||
    line.startsWith(DELETE_FILE_MARKER) ||
    line.startsWith(UPDATE_FILE_MARKER) ||
    line === END_PATCH_MARKER
  );
}

function isChunkBoundary(line: string): boolean {
  return line.startsWith("@@") || isHunkHeader(line);
}
