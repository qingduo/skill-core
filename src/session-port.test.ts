import { describe, expect, it } from "vitest";
import {
  toSkillCoreHistoryMessages,
  toSkillCorePersistedMessages,
  type SkillCorePersistedMessage,
} from "./session-port.js";

describe("session-port conversions", () => {
  it("restores assistant tool calls and tool results into loop history messages", () => {
    const history = toSkillCoreHistoryMessages([
      { role: "user", content: "run pwd" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-1", name: "exec", args: { command: "pwd" } }],
      },
      {
        role: "tool",
        content: "{\"stdout\":\"/tmp\"}",
        toolCallId: "call-1",
        toolName: "exec",
      },
    ]);

    expect(history).toEqual([
      { role: "user", content: "run pwd" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-1", name: "exec", args: { command: "pwd" } }],
      },
      {
        role: "tool",
        content: "{\"stdout\":\"/tmp\"}",
        toolCallId: "call-1",
        toolName: "exec",
        isError: false,
      },
    ]);
  });

  it("converts loop messages into neutral persisted session messages", () => {
    const persisted = toSkillCorePersistedMessages([
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-1", name: "exec", args: { command: "pwd" } }],
      },
      {
        role: "tool",
        content: "{\"stdout\":\"/tmp\"}",
        toolCallId: "call-1",
        toolName: "exec",
        isError: false,
      },
      { role: "assistant", content: "done", toolCalls: [] },
    ]);

    expect(persisted).toEqual([
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-1", name: "exec", args: { command: "pwd" } }],
      },
      {
        role: "tool",
        content: "{\"stdout\":\"/tmp\"}",
        toolCallId: "call-1",
        toolName: "exec",
        isError: false,
      },
      {
        role: "assistant",
        content: "done",
        toolCalls: [],
      },
    ] satisfies SkillCorePersistedMessage[]);
  });
});
