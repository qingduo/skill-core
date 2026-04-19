import fs from "node:fs/promises";

export type UpdateFileChunk = {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
};

async function defaultReadFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf8");
}

/**
 * Applies parsed update chunks onto one file and returns the updated contents.
 */
export async function applyUpdateHunk(
  filePath: string,
  chunks: UpdateFileChunk[],
  options?: { readFile?: (filePath: string) => Promise<string> },
): Promise<string> {
  const reader = options?.readFile ?? defaultReadFile;
  const originalContents = await reader(filePath).catch((error) => {
    throw new Error(`Failed to read file to update ${filePath}: ${String(error)}`);
  });

  const originalLines = originalContents.split("\n");
  if (originalLines.length > 0 && originalLines[originalLines.length - 1] === "") {
    originalLines.pop();
  }

  const replacements = computeReplacements(originalLines, filePath, chunks);
  let newLines = applyReplacements(originalLines, replacements);
  if (newLines.length === 0 || newLines[newLines.length - 1] !== "") {
    newLines = [...newLines, ""];
  }
  return newLines.join("\n");
}

function computeReplacements(
  originalLines: string[],
  filePath: string,
  chunks: UpdateFileChunk[],
): Array<[number, number, string[]]> {
  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
      if (contextIndex === null) {
        throw new Error(`Failed to find context '${chunk.changeContext}' in ${filePath}`);
      }
      lineIndex = contextIndex + 1;
    }

    if (chunk.oldLines.length === 0) {
      replacements.push([lineIndex, 0, chunk.newLines]);
      continue;
    }

    const foundIndex = seekSequence(
      originalLines,
      chunk.oldLines,
      lineIndex,
      chunk.isEndOfFile,
    );
    if (foundIndex === null) {
      throw new Error(
        `Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join("\n")}`,
      );
    }
    replacements.push([foundIndex, chunk.oldLines.length, chunk.newLines]);
    lineIndex = foundIndex + chunk.oldLines.length;
  }

  return replacements.sort((left, right) => left[0] - right[0]);
}

function applyReplacements(
  lines: string[],
  replacements: Array<[number, number, string[]]>,
): string[] {
  const result = [...lines];
  for (const [startIndex, oldLength, newLines] of [...replacements].toReversed()) {
    result.splice(startIndex, oldLength, ...newLines);
  }
  return result;
}

function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  eof: boolean,
): number | null {
  if (pattern.length === 0) {
    return start;
  }
  const maxStart = lines.length - pattern.length;
  const searchStart = eof ? maxStart : start;
  if (searchStart < 0 || searchStart > maxStart) {
    return null;
  }
  for (let index = searchStart; index <= maxStart; index += 1) {
    let matches = true;
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (lines[index + offset] !== pattern[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return index;
    }
  }
  return null;
}
