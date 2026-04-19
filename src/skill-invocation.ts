import type { SkillCoreSkillCommandSpec } from "./skill-types.js";

export type SkillCoreCommandInvocation = {
  command: SkillCoreSkillCommandSpec;
  args?: string;
};

/**
 * Resolves a user command line into a skill command invocation.
 * Supports both `/command ...` and `/skill <name> ...` forms.
 */
export function resolveSkillCommandInvocation(params: {
  commandBodyNormalized: string;
  skillCommands: SkillCoreSkillCommandSpec[];
}): SkillCoreCommandInvocation | null {
  const trimmed = params.commandBodyNormalized.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const match = trimmed.match(/^\/([^\s]+)(?:\s+([\s\S]+))?$/u);
  if (!match) {
    return null;
  }

  const commandName = match[1]?.trim().toLowerCase();
  if (!commandName) {
    return null;
  }

  if (commandName === "skill") {
    const remainder = match[2]?.trim();
    if (!remainder) {
      return null;
    }
    const skillMatch = remainder.match(/^([^\s]+)(?:\s+([\s\S]+))?$/u);
    if (!skillMatch) {
      return null;
    }
    const skillCommand = findSkillCommand(params.skillCommands, skillMatch[1] ?? "");
    if (!skillCommand) {
      return null;
    }
    const args = skillMatch[2]?.trim();
    return { command: skillCommand, ...(args ? { args } : {}) };
  }

  const directCommand = params.skillCommands.find(
    (entry) => entry.name.toLowerCase() === commandName,
  );
  if (!directCommand) {
    return null;
  }
  const args = match[2]?.trim();
  return { command: directCommand, ...(args ? { args } : {}) };
}

function findSkillCommand(
  skillCommands: SkillCoreSkillCommandSpec[],
  rawName: string,
): SkillCoreSkillCommandSpec | undefined {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return undefined;
  }
  const lowered = trimmed.toLowerCase();
  const normalized = normalizeSkillCommandLookup(trimmed);
  return skillCommands.find((entry) => {
    if (entry.name.toLowerCase() === lowered) {
      return true;
    }
    if (entry.skillName.toLowerCase() === lowered) {
      return true;
    }
    return (
      normalizeSkillCommandLookup(entry.name) === normalized ||
      normalizeSkillCommandLookup(entry.skillName) === normalized
    );
  });
}

function normalizeSkillCommandLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}
