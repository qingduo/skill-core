import type { SkillCoreTool } from "./types.js";
import { SkillCoreProcessRegistry } from "./process-registry.js";

type ProcessArgs = {
  action?: "list" | "get" | "kill" | "prune";
  id?: string;
  includeCompleted?: boolean;
};

/**
 * Creates a package-owned process tool backed by the lifecycle-aware process registry.
 */
export function createSkillCoreProcessTool(params: {
  registry: SkillCoreProcessRegistry;
}): SkillCoreTool<ProcessArgs, unknown> {
  return {
    name: "process",
    execute: async (_toolCallId, args) => {
      const action = args?.action ?? "list";
      if (action === "get") {
        if (!args?.id?.trim()) {
          throw new Error("Missing required id");
        }
        return {
          process: params.registry.get(args.id.trim()) ?? null,
        };
      }
      if (action === "kill") {
        if (!args?.id?.trim()) {
          throw new Error("Missing required id");
        }
        return {
          killed: params.registry.kill(args.id.trim()),
        };
      }
      if (action === "prune") {
        return {
          removed: params.registry.pruneCompleted(),
        };
      }
      return {
        processes: params.registry.list({
          includeCompleted: args?.includeCompleted,
        }),
      };
    },
  };
}
