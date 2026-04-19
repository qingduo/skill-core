import { executeDispatchedTool } from "./dispatch.js";
import type { SkillCatalogPort, SkillCoreToolProvider, SkillEnvPolicyPort } from "./ports.js";
import { filterSkillCoreTools } from "./tool-boundary.js";
import type { SkillCoreLogger, SkillCoreRuntimeContext, SkillCoreTool } from "./types.js";

export type SkillCoreRuntimePorts = {
  tools: SkillCoreToolProvider;
  skillCatalog?: SkillCatalogPort;
  envPolicy?: SkillEnvPolicyPort;
  logger?: SkillCoreLogger;
};

/**
 * Decoupled runtime facade for script-oriented skill execution.
 * The host runtime supplies ports; this runtime applies boundary rules and dispatches tools.
 */
export function createSkillCoreRuntime(ports: SkillCoreRuntimePorts) {
  const listTools = async (context: SkillCoreRuntimeContext): Promise<SkillCoreTool[]> => {
    const hostTools = await ports.tools.listTools(context);
    const filtered = filterSkillCoreTools(hostTools);
    ports.logger?.debug?.("skill-core tools resolved", {
      requested: hostTools.length,
      filtered: filtered.length,
    });
    return filtered;
  };

  const executeToolCall = async (params: {
    context: SkillCoreRuntimeContext;
    toolName: string;
    toolCallId: string;
    args: unknown;
    signal?: AbortSignal;
  }): Promise<unknown> => {
    const tools = await listTools(params.context);
    return await executeDispatchedTool({
      tools,
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      args: params.args,
      signal: params.signal,
    });
  };

  return {
    /**
     * Returns the strict skill-core tool list for the current context.
     */
    listTools,

    /**
     * Executes one tool call against the filtered tool list.
     */
    executeToolCall,

    /**
     * Dispatches one command via the filtered tool list.
     */
    dispatchTool: async (params: {
      context: SkillCoreRuntimeContext;
      toolName: string;
      toolCallId: string;
      command: string;
      commandName: string;
      skillName: string;
      signal?: AbortSignal;
    }): Promise<unknown> => {
      return await executeToolCall({
        context: params.context,
        toolName: params.toolName,
        toolCallId: params.toolCallId,
        signal: params.signal,
        args: {
          command: params.command,
          commandName: params.commandName,
          skillName: params.skillName,
        } as {
          command: string;
          commandName: string;
          skillName: string;
        },
      });
    },

    /**
     * Lists command names from the host-provided catalog port.
     */
    listSkillCommands: async (workspaceDir?: string): Promise<string[]> => {
      if (!ports.skillCatalog) {
        return [];
      }
      return await ports.skillCatalog.listSkillCommandNames(workspaceDir);
    },

    /**
     * Applies host-provided environment policy. If none exists, returns input unchanged.
     */
    applySkillEnvPolicy: async (
      baseEnv: Record<string, string>,
    ): Promise<Record<string, string>> => {
      if (!ports.envPolicy) {
        return baseEnv;
      }
      return await ports.envPolicy.applyEnvPolicy(baseEnv);
    },
  };
}
