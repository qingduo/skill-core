import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { SkillCatalogPort } from "./ports.js";
import type {
  SkillCoreParsedFrontmatter,
  SkillCoreSkillCommandDispatchSpec,
  SkillCoreSkillCommandSpec,
  SkillCoreSkillEntry,
  SkillCoreSkillMetadata,
} from "./skill-types.js";

const SKILL_COMMAND_MAX_LENGTH = 32;
const SKILL_COMMAND_FALLBACK = "skill";
const SKILL_COMMAND_DESCRIPTION_MAX_LENGTH = 100;

type BuildWorkspaceSkillCommandSpecsOptions = {
  reservedNames?: Set<string>;
  skillFilter?: string[];
};

type FilesystemSkillCatalogOptions = BuildWorkspaceSkillCommandSpecsOptions;

/**
 * Creates a package-local skill catalog backed by skill directories under `workspaceDir/skills`.
 * This keeps command discovery inside `skill-core` instead of reusing main-repo helpers.
 */
export function createFilesystemSkillCatalog(
  options?: FilesystemSkillCatalogOptions,
): SkillCatalogPort {
  return {
    listSkillCommandNames: async (workspaceDir?: string): Promise<string[]> => {
      if (!workspaceDir) {
        return [];
      }
      const specs = await buildWorkspaceSkillCommandSpecs(workspaceDir, options);
      return specs.map((entry) => entry.name);
    },
  };
}

/**
 * Loads immediate child skills from `workspaceDir/skills`.
 * The package intentionally keeps discovery simple and deterministic.
 */
export async function loadWorkspaceSkillEntries(workspaceDir: string): Promise<SkillCoreSkillEntry[]> {
  const skillsDir = path.join(workspaceDir, "skills");
  const entries: SkillCoreSkillEntry[] = [];
  let dirEntries: Dirent<string>[];
  try {
    dirEntries = await fs.readdir(skillsDir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }

  for (const dirEntry of dirEntries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (!dirEntry.isDirectory()) {
      continue;
    }
    const skillDir = path.join(skillsDir, dirEntry.name);
    const skillFilePath = path.join(skillDir, "SKILL.md");
    const skillSource = await readOptionalUtf8(skillFilePath);
    if (!skillSource) {
      continue;
    }

    const { frontmatter, body } = parseSkillSource(skillSource);
    const name = readFrontmatterValue(frontmatter, ["name"]) || dirEntry.name;
    const description = resolveSkillDescription(name, frontmatter, body);
    const userInvocable = readBooleanFrontmatter(frontmatter, ["user-invocable", "user_invocable"], true);
    entries.push({
      name,
      description,
      baseDir: skillDir,
      filePath: skillFilePath,
      frontmatter,
      metadata: resolveSkillMetadata(frontmatter),
      userInvocable,
    });
  }

  return entries;
}

/**
 * Builds normalized command specs for workspace skills.
 * Only user-invocable skills are surfaced as command specs.
 */
export async function buildWorkspaceSkillCommandSpecs(
  workspaceDir: string,
  options?: BuildWorkspaceSkillCommandSpecsOptions,
): Promise<SkillCoreSkillCommandSpec[]> {
  const rawEntries = await loadWorkspaceSkillEntries(workspaceDir);
  const normalizedFilter = normalizeSkillFilter(options?.skillFilter);
  const filteredEntries = rawEntries.filter((entry) => {
    if (!entry.userInvocable) {
      return false;
    }
    if (!normalizedFilter) {
      return true;
    }
    return normalizedFilter.includes(entry.name);
  });

  const used = new Set<string>();
  for (const reserved of options?.reservedNames ?? []) {
    used.add(reserved.toLowerCase());
  }

  const specs: SkillCoreSkillCommandSpec[] = [];
  for (const entry of filteredEntries) {
    const baseName = sanitizeSkillCommandName(entry.name);
    const uniqueName = resolveUniqueSkillCommandName(baseName, used);
    used.add(uniqueName.toLowerCase());
    specs.push({
      name: uniqueName,
      skillName: entry.name,
      description: truncateDescription(entry.description || entry.name),
      ...(resolveCommandDispatch(entry.frontmatter)
        ? { dispatch: resolveCommandDispatch(entry.frontmatter) }
        : {}),
    });
  }
  return specs;
}

function normalizeSkillFilter(skillFilter?: string[]): string[] | undefined {
  if (skillFilter === undefined) {
    return undefined;
  }
  return skillFilter.map((entry) => entry.trim()).filter(Boolean);
}

function sanitizeSkillCommandName(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const trimmed = normalized.slice(0, SKILL_COMMAND_MAX_LENGTH);
  return trimmed || SKILL_COMMAND_FALLBACK;
}

function resolveUniqueSkillCommandName(base: string, used: Set<string>): string {
  const normalizedBase = base.toLowerCase();
  if (!used.has(normalizedBase)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `_${index}`;
    const maxBaseLength = Math.max(1, SKILL_COMMAND_MAX_LENGTH - suffix.length);
    const candidate = `${base.slice(0, maxBaseLength)}${suffix}`;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${base.slice(0, Math.max(1, SKILL_COMMAND_MAX_LENGTH - 2))}_x`;
}

function truncateDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length <= SKILL_COMMAND_DESCRIPTION_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, SKILL_COMMAND_DESCRIPTION_MAX_LENGTH - 1)}…`;
}

async function readOptionalUtf8(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function parseSkillSource(source: string): { frontmatter: SkillCoreParsedFrontmatter; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: source };
  }
  return {
    frontmatter: parseFrontmatterBlock(match[1] ?? ""),
    body: match[2] ?? "",
  };
}

function parseFrontmatterBlock(block: string): SkillCoreParsedFrontmatter {
  const frontmatter: SkillCoreParsedFrontmatter = {};
  for (const rawLine of block.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/u);
    if (!match) {
      continue;
    }
    const key = match[1]?.trim();
    const value = stripMatchingQuotes(match[2]?.trim() ?? "");
    if (!key) {
      continue;
    }
    frontmatter[key] = value;
  }
  return frontmatter;
}

function stripMatchingQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function resolveSkillDescription(
  skillName: string,
  frontmatter: SkillCoreParsedFrontmatter,
  body: string,
): string {
  const description = readFrontmatterValue(frontmatter, ["description"]);
  if (description) {
    return description;
  }
  for (const rawLine of body.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    return line;
  }
  return skillName;
}

function readFrontmatterValue(
  frontmatter: SkillCoreParsedFrontmatter,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = frontmatter[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readBooleanFrontmatter(
  frontmatter: SkillCoreParsedFrontmatter,
  keys: readonly string[],
  defaultValue: boolean,
): boolean {
  const value = readFrontmatterValue(frontmatter, keys);
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() !== "false";
}

function parseStringList(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value
    .split(/[,\s]+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function resolveSkillMetadata(frontmatter: SkillCoreParsedFrontmatter): SkillCoreSkillMetadata | undefined {
  const metadataBlock = parseSkillMetadataBlock(
    readFrontmatterValue(frontmatter, ["metadata", "openclaw"]),
  );
  const primaryEnv =
    readFrontmatterValue(frontmatter, ["primary-env", "primary_env", "primaryEnv"]) ??
    readMetadataString(metadataBlock, ["primaryEnv"]);
  const requiredEnv =
    parseStringList(
      readFrontmatterValue(frontmatter, ["required-env", "required_env", "requiredEnv"]),
    ) ?? readMetadataStringList(metadataBlock, ["requires", "env"]);
  const skillKey =
    readFrontmatterValue(frontmatter, ["skill-key", "skill_key", "skillKey"]) ??
    readMetadataString(metadataBlock, ["skillKey"]);

  if (!primaryEnv && !requiredEnv && !skillKey) {
    return undefined;
  }
  return {
    ...(skillKey ? { skillKey } : {}),
    ...(primaryEnv ? { primaryEnv } : {}),
    ...(requiredEnv ? { requiredEnv } : {}),
  };
}

function parseSkillMetadataBlock(value?: string): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    if ("openclaw" in parsed) {
      const nested = (parsed as { openclaw?: unknown }).openclaw;
      if (nested && typeof nested === "object") {
        return nested as Record<string, unknown>;
      }
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  pathSegments: readonly string[],
): string | undefined {
  const value = readNestedMetadataValue(metadata, pathSegments);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readMetadataStringList(
  metadata: Record<string, unknown> | undefined,
  pathSegments: readonly string[],
): string[] | undefined {
  const value = readNestedMetadataValue(metadata, pathSegments);
  if (!Array.isArray(value)) {
    return undefined;
  }
  const list = value.map((entry) => String(entry).trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function readNestedMetadataValue(
  metadata: Record<string, unknown> | undefined,
  pathSegments: readonly string[],
): unknown {
  let current: unknown = metadata;
  for (const segment of pathSegments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveCommandDispatch(
  frontmatter: SkillCoreParsedFrontmatter,
): SkillCoreSkillCommandDispatchSpec | undefined {
  const kind = readFrontmatterValue(frontmatter, ["command-dispatch", "command_dispatch"]);
  if (!kind || kind.toLowerCase() !== "tool") {
    return undefined;
  }
  const toolName = readFrontmatterValue(frontmatter, ["command-tool", "command_tool"]);
  if (!toolName) {
    return undefined;
  }
  return { kind: "tool", toolName, argMode: "raw" };
}
