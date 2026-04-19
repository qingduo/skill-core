import type { SkillCoreAgentMessage, SkillCoreAgentModelPort, SkillCoreAgentToolCall } from "./agent-loop.js";

export type OpenAiCompatibleSkillCoreProviderOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
};

type OpenAiCompatibleChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: unknown;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

/**
 * Builds a package-owned model port that speaks the OpenAI-compatible chat-completions API.
 * This keeps the first built-in provider path fully inside `packages/skill-core`.
 */
export function createOpenAiCompatibleSkillCoreModelPort(
  options: OpenAiCompatibleSkillCoreProviderOptions,
): SkillCoreAgentModelPort {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    generate: async (params) => {
      const response = await fetchImpl(resolveChatCompletionsUrl(options.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
          ...(options.headers ?? {}),
        },
        body: JSON.stringify({
          model: options.model,
          stream: false,
          messages: params.messages.map(toOpenAiMessage),
          tools: params.tools.length > 0 ? params.tools.map(toOpenAiTool) : undefined,
          tool_choice: params.tools.length > 0 ? "auto" : undefined,
        }),
        signal: params.signal,
      });

      if (!response.ok) {
        throw new Error(await buildProviderError(response));
      }

      const payload = (await response.json()) as OpenAiCompatibleChatCompletionResponse;
      const choice = payload.choices?.[0];
      const toolCalls = choice?.message?.tool_calls?.map(toSkillCoreToolCall) ?? [];

      return {
        assistantText: extractAssistantText(choice?.message?.content),
        toolCalls,
        stopReason: choice?.finish_reason ?? (toolCalls.length > 0 ? "tool_calls" : "stop"),
      };
    },
  };
}

function resolveChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function toOpenAiMessage(message: SkillCoreAgentMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
      name: message.toolName,
    };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.args ?? {}),
        },
      })),
    };
  }
  return {
    role: message.role,
    content: message.content,
  };
}

function toOpenAiTool(tool: { name: string }): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: `skill-core tool ${tool.name}`,
      parameters: {
        type: "object",
        additionalProperties: true,
      },
    },
  };
}

function toSkillCoreToolCall(entry: {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}, index: number): SkillCoreAgentToolCall {
  const name = entry.function?.name?.trim();
  if (!name) {
    throw new Error("Provider returned a tool call without a function name");
  }
  return {
    id: entry.id?.trim() || `tool-call-${index + 1}`,
    name,
    args: parseToolArguments(entry.function?.arguments),
  };
}

function parseToolArguments(raw: string | undefined): unknown {
  if (!raw?.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { rawArguments: raw };
  }
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const typedEntry = entry as { type?: unknown; text?: unknown };
      return typedEntry.type === "text" && typeof typedEntry.text === "string" ? typedEntry.text : "";
    })
    .filter(Boolean)
    .join("");
}

async function buildProviderError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as OpenAiCompatibleChatCompletionResponse;
    const message = payload.error?.message?.trim();
    if (message) {
      return `OpenAI-compatible provider error (${response.status}): ${message}`;
    }
  } catch {
    // Fall back to plain status text below.
  }
  return `OpenAI-compatible provider error (${response.status}): ${response.statusText || "request failed"}`;
}
