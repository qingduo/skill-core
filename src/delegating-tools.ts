import type { SkillCoreTool } from "./types.js";

/**
 * Creates a package-owned facade for a host-provided tool implementation.
 * The facade keeps the canonical skill-core tool name while delegating execution.
 */
export function createDelegatingSkillCoreTool(params: {
  name: "exec" | "process";
  delegate: SkillCoreTool;
}): SkillCoreTool {
  return {
    name: params.name,
    execute: async (toolCallId, args, signal) => {
      return await params.delegate.execute(toolCallId, args, signal);
    },
  };
}
