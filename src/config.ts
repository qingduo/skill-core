export type SkillCoreRuntimeMode = "standard" | "skill-core";

/**
 * Skill-core runtime boundary: only script-oriented filesystem + process tools.
 */
export const SKILL_CORE_TOOL_NAMES = [
  "read",
  "write",
  "edit",
  "apply_patch",
  "exec",
  "process",
] as const;

export type SkillCoreToolName = (typeof SKILL_CORE_TOOL_NAMES)[number];

const SKILL_CORE_TOOL_SET = new Set<string>(SKILL_CORE_TOOL_NAMES);

/**
 * Runtime guard that validates whether a tool belongs to the skill-core boundary.
 */
export function isSkillCoreToolName(toolName: string): toolName is SkillCoreToolName {
  return SKILL_CORE_TOOL_SET.has(toolName);
}
