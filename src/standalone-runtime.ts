import { createSkillCoreApplyPatchTool } from "./apply-patch-tool.js";
import { createSkillCoreExecTool } from "./exec-tool.js";
import { SkillCoreProcessRegistry } from "./process-registry.js";
import { createSkillCoreProcessTool } from "./process-tool.js";
import { createFilesystemSkillCatalog } from "./skill-catalog.js";
import { createSkillCoreFileTools } from "./file-tools.js";
import { createSkillCoreRuntime, type SkillCoreRuntimePorts } from "./runtime.js";
import type { SkillCoreLogger, SkillCoreRuntimeContext, SkillCoreTool } from "./types.js";

export type StandaloneSkillCoreRuntimeOptions = {
  workspaceDir: string;
  extraTools?: SkillCoreTool[];
  logger?: SkillCoreLogger;
  envPolicy?: SkillCoreRuntimePorts["envPolicy"];
  enableExec?: boolean;
};

/**
 * Creates a package-local runtime that works without any OpenClaw adapter.
 * It provides filesystem skill discovery and package-owned file tools by default.
 */
export function createStandaloneSkillCoreRuntime(options: StandaloneSkillCoreRuntimeOptions) {
  const registry = new SkillCoreProcessRegistry();
  return createSkillCoreRuntime({
    tools: {
      listTools: async (context: SkillCoreRuntimeContext): Promise<SkillCoreTool[]> => {
        const workspaceDir = context.workspaceDir ?? options.workspaceDir;
        const fileTools = createSkillCoreFileTools({ workspaceDir }) as SkillCoreTool[];
        const applyPatchTool = createSkillCoreApplyPatchTool({ workspaceDir }) as SkillCoreTool;
        const execTools = options.enableExec === false
          ? []
          : ([
              createSkillCoreExecTool({ workspaceDir, registry }),
              createSkillCoreProcessTool({ registry }),
            ] as SkillCoreTool[]);
        return [...fileTools, applyPatchTool, ...execTools, ...(options.extraTools ?? [])];
      },
    },
    skillCatalog: createFilesystemSkillCatalog(),
    envPolicy: options.envPolicy,
    logger: options.logger,
  });
}
