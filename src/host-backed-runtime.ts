import { createSkillCoreApplyPatchTool } from "./apply-patch-tool.js";
import { createDelegatingSkillCoreTool } from "./delegating-tools.js";
import { createFilesystemSkillCatalog } from "./skill-catalog.js";
import { createSkillCoreFileTools } from "./file-tools.js";
import { createSkillCoreRuntime, type SkillCoreRuntimePorts } from "./runtime.js";
import type { SkillCoreRuntimeContext, SkillCoreTool } from "./types.js";

export type HostBackedSkillCoreRuntimeOptions = {
  workspaceDir: string;
  hostTools: SkillCoreRuntimePorts["tools"];
  skillCatalog?: SkillCoreRuntimePorts["skillCatalog"];
  envPolicy?: SkillCoreRuntimePorts["envPolicy"];
  logger?: SkillCoreRuntimePorts["logger"];
};

/**
 * Creates a package-owned runtime assembler for host-backed skill-core execution.
 * Package-owned tools define the visible tool surface while host tools can still
 * provide execution for delegated capabilities such as exec and process.
 */
export function createHostBackedSkillCoreRuntime(
  options: HostBackedSkillCoreRuntimeOptions,
) {
  const skillCatalog = options.skillCatalog ?? createFilesystemSkillCatalog();
  return createSkillCoreRuntime({
    tools: {
      listTools: async (context: SkillCoreRuntimeContext): Promise<SkillCoreTool[]> => {
        const hostTools = await options.hostTools.listTools(context);
        const workspaceDir = context.workspaceDir ?? options.workspaceDir;
        const packageFileTools = createSkillCoreFileTools({ workspaceDir }) as SkillCoreTool[];
        const packageApplyPatchTool = hostTools.some((tool) => tool.name === "apply_patch")
          ? ([createSkillCoreApplyPatchTool({ workspaceDir })] as SkillCoreTool[])
          : [];
        const packageDelegatedHostTools = hostTools.flatMap((tool) => {
          if (tool.name === "exec" || tool.name === "process") {
            return [
              createDelegatingSkillCoreTool({
                name: tool.name,
                delegate: tool,
              }),
            ];
          }
          return [];
        });
        const retainedHostTools = hostTools.filter(
          (tool) =>
            tool.name !== "read" &&
            tool.name !== "write" &&
            tool.name !== "edit" &&
            tool.name !== "apply_patch" &&
            tool.name !== "exec" &&
            tool.name !== "process",
        );
        return [
          ...packageFileTools,
          ...packageApplyPatchTool,
          ...packageDelegatedHostTools,
          ...retainedHostTools,
        ];
      },
    },
    skillCatalog,
    envPolicy: options.envPolicy,
    logger: options.logger,
  });
}
