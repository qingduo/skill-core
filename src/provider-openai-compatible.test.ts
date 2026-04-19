import { describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleSkillCoreModelPort } from "./provider-openai-compatible.js";

describe("openai-compatible skill-core provider", () => {
  it("posts chat-completions requests and maps plain assistant responses", async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "final answer",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const model = createOpenAiCompatibleSkillCoreModelPort({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "gpt-test",
      fetchImpl,
    });
    const result = await model.generate({
      messages: [{ role: "user", content: "hello" }],
      tools: [{ name: "read" }],
    });

    expect(result).toEqual({
      assistantText: "final answer",
      toolCalls: [],
      stopReason: "stop",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer secret",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-test",
      stream: false,
      messages: [{ role: "user", content: "hello" }],
      tools: [
        {
          type: "function",
          function: {
            name: "read",
            description: "skill-core tool read",
            parameters: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      ],
      tool_choice: "auto",
    });
  });

  it("maps provider tool calls into skill-core tool calls", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: [{ type: "text", text: "checking" }],
                tool_calls: [
                  {
                    id: "call-1",
                    function: {
                      name: "exec",
                      arguments: "{\"command\":\"pwd\"}",
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const model = createOpenAiCompatibleSkillCoreModelPort({
      baseUrl: "https://example.test/v1/",
      apiKey: "secret",
      model: "gpt-test",
      fetchImpl,
    });
    const result = await model.generate({
      messages: [{ role: "user", content: "run pwd" }],
      tools: [{ name: "exec" }],
    });

    expect(result).toEqual({
      assistantText: "checking",
      toolCalls: [
        {
          id: "call-1",
          name: "exec",
          args: { command: "pwd" },
        },
      ],
      stopReason: "tool_calls",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.any(Object),
    );
  });
});
