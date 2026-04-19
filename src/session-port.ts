import type { SkillCoreAgentMessage, SkillCoreAgentToolCall } from "./agent-loop.js";

/**
 * Persisted tool-call metadata used by the package-owned session contract.
 * This stays repository-agnostic so hosts can map it to any transcript format.
 */
export type SkillCorePersistedToolCall = {
  id: string;
  name: string;
  args?: unknown;
};

/**
 * Neutral persisted message contract used between the package runner and host session storage.
 * Hosts are free to serialize this shape into their own transcript format.
 */
export type SkillCorePersistedMessage =
  | {
      role: "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      toolCalls?: SkillCorePersistedToolCall[];
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
      toolName: string;
      isError?: boolean;
    };

/**
 * Minimal session-history port that lets skill-core read and append conversation state
 * without depending on any repository-specific session implementation.
 */
export type SkillCoreSessionHistoryPort = {
  loadHistory: () => Promise<SkillCorePersistedMessage[]>;
  appendUserMessage: (content: string) => Promise<void>;
  appendMessages: (messages: SkillCorePersistedMessage[]) => Promise<void>;
  flush?: () => Promise<void>;
};

/**
 * Converts persisted session history into the package-owned agent-loop message format.
 */
export function toSkillCoreHistoryMessages(
  messages: SkillCorePersistedMessage[],
): SkillCoreAgentMessage[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        isError: Boolean(message.isError),
      };
    }
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
        toolCalls: (message.toolCalls ?? []).map(toAgentToolCall),
      };
    }
    return {
      role: "user",
      content: message.content,
    };
  });
}

/**
 * Converts package-owned loop messages into the neutral persisted session shape.
 * Hosts can serialize the returned messages into their own transcript format.
 */
export function toSkillCorePersistedMessages(
  messages: SkillCoreAgentMessage[],
): SkillCorePersistedMessage[] {
  const persisted: SkillCorePersistedMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }
    if (message.role === "tool") {
      persisted.push({
        role: "tool",
        content: message.content,
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        isError: message.isError,
      });
      continue;
    }
    if (message.role === "assistant") {
      persisted.push({
        role: "assistant",
        content: message.content,
        toolCalls: (message.toolCalls ?? []).map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args,
        })),
      });
      continue;
    }
    persisted.push({
      role: "user",
      content: message.content,
    });
  }
  return persisted;
}

function toAgentToolCall(toolCall: SkillCorePersistedToolCall): SkillCoreAgentToolCall {
  return {
    id: toolCall.id,
    name: toolCall.name,
    args: toolCall.args ?? {},
  };
}
