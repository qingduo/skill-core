import { isSkillCoreToolName } from "./config.js";
import type { SkillCoreTool } from "./types.js";

/**
 * Applies the strict skill-core tool boundary.
 * Unknown or unsupported tools are dropped by default.
 */
export function filterSkillCoreTools<TTool extends SkillCoreTool>(tools: readonly TTool[]): TTool[] {
  return tools.filter((tool) => isSkillCoreToolName(tool.name));
}
