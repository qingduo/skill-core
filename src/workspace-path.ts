import path from "node:path";

/**
 * Resolves a required string field and trims surrounding whitespace.
 */
export function resolveRequiredString(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required ${field}`);
  }
  return trimmed;
}

/**
 * Resolves a workspace-relative path and rejects traversal outside the workspace root.
 */
export function resolveWorkspacePath(workspaceDir: string, rawPath: string | undefined): string {
  const input = resolveRequiredString(rawPath, "path");
  const stripped = input.startsWith("@") ? input.slice(1) : input;
  const absolute = path.resolve(workspaceDir, stripped);
  const relative = path.relative(workspaceDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace root: ${input}`);
  }
  return absolute;
}
