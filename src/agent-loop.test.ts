import { describe, expect, it, vi } from "vitest";
import { createSkillCoreAgentLoop } from "./agent-loop.js";
import { createSkillCoreRuntime } from "./runtime.js";

describe("skill-core agent loop", () => {
  it("loops through tool calls and returns the final assistant text", async () => {
    const runtime = createSkillCoreRuntime({
      tools: {
        listTools: async () => [
          {
            name: "read",
            execute: async (_toolCallId, args) => ({
              content: `read:${String((args as { path?: string }).path ?? "")}`,
            }),
          },
        ],
      },
    });
    const model = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          assistantText: "Need to inspect a file.",
          toolCalls: [
            {
              id: "tool-1",
              name: "read",
              args: { path: "README.md" },
            },
          ],
          stopReason: "tool_calls",
        })
        .mockResolvedValueOnce({
          assistantText: "Done after reading.",
          stopReason: "stop",
        }),
    };

    const loop = createSkillCoreAgentLoop({
      runtime,
      model,
    });
    const result = await loop.run({
      context: { workspaceDir: "/tmp/workspace" },
      prompt: "Check the readme.",
      systemPrompt: "You are a skill runtime.",
    });

    expect(result.text).toBe("Done after reading.");
    expect(result.steps).toBe(2);
    expect(result.stopReason).toBe("stop");
    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(result.messages).toEqual([
      { role: "system", content: "You are a skill runtime." },
      { role: "user", content: "Check the readme." },
      {
        role: "assistant",
        content: "Need to inspect a file.",
        toolCalls: [
          {
            id: "tool-1",
            name: "read",
            args: { path: "README.md" },
          },
        ],
      },
      {
        role: "tool",
        toolCallId: "tool-1",
        toolName: "read",
        content: JSON.stringify({ content: "read:README.md" }),
      },
      {
        role: "assistant",
        content: "Done after reading.",
        toolCalls: undefined,
      },
    ]);
  });

  it("records tool failures and exits on max steps when the model keeps requesting tools", async () => {
    const runtime = createSkillCoreRuntime({
      tools: {
        listTools: async () => [
          {
            name: "exec",
            execute: async () => {
              throw new Error("exec failed");
            },
          },
        ],
      },
    });
    const model = {
      generate: vi.fn(async () => ({
        assistantText: "Trying again.",
        toolCalls: [
          {
            id: "tool-exec",
            name: "exec",
            args: { command: "pwd" },
          },
        ],
        stopReason: "tool_calls",
      })),
    };

    const loop = createSkillCoreAgentLoop({
      runtime,
      model,
      maxSteps: 2,
    });
    const result = await loop.run({
      context: { workspaceDir: "/tmp/workspace" },
      prompt: "Run exec.",
    });

    expect(result.stopReason).toBe("max_steps");
    expect(result.steps).toBe(2);
    expect(result.messages.filter((entry) => entry.role === "tool")).toEqual([
      {
        role: "tool",
        toolCallId: "tool-exec",
        toolName: "exec",
        isError: true,
        content: JSON.stringify({ error: "exec failed" }),
      },
      {
        role: "tool",
        toolCallId: "tool-exec",
        toolName: "exec",
        isError: true,
        content: JSON.stringify({ error: "exec failed" }),
      },
    ]);
  });
});
