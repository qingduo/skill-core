import type { SkillCoreRuntimeContext, SkillCoreTool } from "./types.js";

/**
 * Host-provided tool source.
 * The host owns tool creation, auth, and policy, then skill-core applies boundary filtering.
 */
export type SkillCoreToolProvider = {
  listTools: (context: SkillCoreRuntimeContext) => Promise<SkillCoreTool[]>;
};

/**
 * Host-provided skill catalog.
 * This keeps skill discovery/eligibility logic outside of skill-core internals.
 */
export type SkillCatalogPort = {
  listSkillCommandNames: (workspaceDir?: string) => Promise<string[]>;
};

/**
 * Host-provided environment policy hook for skill execution.
 * skill-core never directly reads host secret stores.
 */
export type SkillEnvPolicyPort = {
  applyEnvPolicy: (baseEnv: Record<string, string>) => Promise<Record<string, string>>;
};
