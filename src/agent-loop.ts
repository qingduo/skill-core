import type { SkillCoreRuntimeContext, SkillCoreTool } from "./types.js";

export type SkillCoreAgentToolCall = {
  id: string;
  name: string;
  args: unknown;
};

export type SkillCoreAgentMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      toolCalls?: SkillCoreAgentToolCall[];
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
      toolName: string;
      isError?: boolean;
    };

export type SkillCoreAgentModelResult = {
  assistantText?: string;
  toolCalls?: SkillCoreAgentToolCall[];
  stopReason?: "stop" | "tool_calls" | "max_steps" | "timeout" | "error" | string;
};

export type SkillCoreAgentModelPort = {
  generate: (params: {
    messages: readonly SkillCoreAgentMessage[];
    tools: readonly Pick<SkillCoreTool, "name">[];
    signal?: AbortSignal;
  }) => Promise<SkillCoreAgentModelResult>;
};

export type SkillCoreAgentRuntime = {
  listTools: (context: SkillCoreRuntimeContext) => Promise<SkillCoreTool[]>;
  executeToolCall: (params: {
    context: SkillCoreRuntimeContext;
    toolName: string;
    toolCallId: string;
    args: unknown;
    signal?: AbortSignal;
  }) => Promise<unknown>;
};

export type SkillCoreAgentLoopOptions = {
  runtime: SkillCoreAgentRuntime;
  model: SkillCoreAgentModelPort;
  logger?: {
    debug?: (message: string, meta?: Record<string, unknown>) => void;
    warn?: (message: string, meta?: Record<string, unknown>) => void;
  };
  maxSteps?: number;
};

export type SkillCoreAgentRunOptions = {
  context: SkillCoreRuntimeContext;
  prompt: string;
  systemPrompt?: string;
  initialMessages?: SkillCoreAgentMessage[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxSteps?: number;
};

export type SkillCoreAgentRunResult = {
  text: string;
  steps: number;
  stopReason: string;
  messages: SkillCoreAgentMessage[];
};

/**
 * Runs a minimal package-owned agent loop around the skill-core runtime.
 * The loop is intentionally small: model turn, tool execution, append tool result, repeat.
 */
export function createSkillCoreAgentLoop(options: SkillCoreAgentLoopOptions) {
  return {
    run: async (params: SkillCoreAgentRunOptions): Promise<SkillCoreAgentRunResult> => {
      const maxSteps = params.maxSteps ?? options.maxSteps ?? 8;
      const { signal, cleanup } = createRunSignal(params.timeoutMs, params.signal);
      const tools = await options.runtime.listTools(params.context);
      const messages: SkillCoreAgentMessage[] = [...(params.initialMessages ?? [])];
      if (params.systemPrompt?.trim()) {
        messages.unshift({ role: "system", content: params.systemPrompt });
      }
      messages.push({ role: "user", content: params.prompt });

      let lastAssistantText = "";

      try {
        for (let step = 1; step <= maxSteps; step += 1) {
          options.logger?.debug?.("skill-core agent loop turn", {
            step,
            messageCount: messages.length,
            toolCount: tools.length,
          });
          const response = await options.model.generate({
            messages,
            tools: tools.map((tool) => ({ name: tool.name })),
            signal,
          });
          const toolCalls = response.toolCalls?.filter((entry) => entry.name.trim()) ?? [];
          lastAssistantText = response.assistantText ?? lastAssistantText;
          messages.push({
            role: "assistant",
            content: response.assistantText ?? "",
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          });

          if (toolCalls.length === 0) {
            return {
              text: response.assistantText ?? "",
              steps: step,
              stopReason: response.stopReason ?? "stop",
              messages,
            };
          }

          for (const toolCall of toolCalls) {
            await appendToolResult({
              runtime: options.runtime,
              context: params.context,
              messages,
              signal,
              toolCall,
            });
          }
        }

        options.logger?.warn?.("skill-core agent loop hit max steps", {
          maxSteps,
        });
        return {
          text: lastAssistantText,
          steps: maxSteps,
          stopReason: "max_steps",
          messages,
        };
      } finally {
        cleanup();
      }
    },
  };
}

async function appendToolResult(params: {
  runtime: SkillCoreAgentRuntime;
  context: SkillCoreRuntimeContext;
  messages: SkillCoreAgentMessage[];
  signal?: AbortSignal;
  toolCall: SkillCoreAgentToolCall;
}): Promise<void> {
  try {
    const result = await params.runtime.executeToolCall({
      context: params.context,
      toolName: params.toolCall.name,
      toolCallId: params.toolCall.id,
      args: params.toolCall.args,
      signal: params.signal,
    });
    params.messages.push({
      role: "tool",
      toolCallId: params.toolCall.id,
      toolName: params.toolCall.name,
      content: serializeToolPayload(result),
    });
  } catch (error) {
    params.messages.push({
      role: "tool",
      toolCallId: params.toolCall.id,
      toolName: params.toolCall.name,
      isError: true,
      content: serializeToolPayload({
        error: error instanceof Error ? error.message : String(error),
      }),
    });
  }
}

function serializeToolPayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload ?? null);
}

function createRunSignal(timeoutMs?: number, upstream?: AbortSignal): {
  signal?: AbortSignal;
  cleanup: () => void;
} {
  if (!timeoutMs && !upstream) {
    return { signal: undefined, cleanup: () => {} };
  }
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  const abortFromUpstream = () => {
    controller.abort(upstream?.reason);
  };

  if (upstream) {
    if (upstream.aborted) {
      controller.abort(upstream.reason);
    } else {
      upstream.addEventListener("abort", abortFromUpstream, { once: true });
    }
  }

  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort(new Error(`Agent loop timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (upstream) {
        upstream.removeEventListener("abort", abortFromUpstream);
      }
    },
  };
}
