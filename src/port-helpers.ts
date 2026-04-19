import type { SkillCatalogPort, SkillCoreToolProvider, SkillEnvPolicyPort } from "./ports.js";
import type { SkillCoreRuntimeContext, SkillCoreTool } from "./types.js";

/**
 * Wraps a plain async callback into a skill-core tool provider port.
 */
export function createSkillCoreToolProvider(params: {
  listTools: (context: SkillCoreRuntimeContext) => Promise<SkillCoreTool[]>;
}): SkillCoreToolProvider {
  return {
    listTools: params.listTools,
  };
}

/**
 * Creates a filesystem-agnostic static skill catalog port.
 * Useful for adapters, tests, and host overrides.
 */
export function createStaticSkillCatalog(commandNames: string[]): SkillCatalogPort {
  const values = [...commandNames];
  return {
    listSkillCommandNames: async () => values,
  };
}

/**
 * Creates a no-op env policy port that preserves the incoming environment.
 */
export function createNoopSkillEnvPolicy(): SkillEnvPolicyPort {
  return {
    applyEnvPolicy: async (baseEnv: Record<string, string>): Promise<Record<string, string>> => {
      return baseEnv;
    },
  };
}
