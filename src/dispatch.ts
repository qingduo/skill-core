import type { SkillCoreTool } from "./types.js";

/**
 * Looks up a tool by name from an already-filtered tool list.
 */
export function resolveDispatchedTool(
  tools: readonly SkillCoreTool[],
  toolName: string,
): SkillCoreTool | undefined {
  return tools.find((tool) => tool.name === toolName);
}

/**
 * Executes a dispatched tool call with a deterministic payload shape.
 */
export async function executeDispatchedTool(params: {
  tools: readonly SkillCoreTool[];
  toolName: string;
  toolCallId: string;
  args: unknown;
  signal?: AbortSignal;
}): Promise<unknown> {
  const tool = resolveDispatchedTool(params.tools, params.toolName);
  if (!tool) {
    throw new Error(`Tool not available: ${params.toolName}`);
  }
  return await tool.execute(params.toolCallId, params.args, params.signal);
}
