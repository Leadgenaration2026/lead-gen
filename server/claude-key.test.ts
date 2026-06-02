import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./_core/env";

describe("Claude API Key Validation", () => {
  it("should have a valid Anthropic API key configured", () => {
    const apiKey = ENV.anthropicApiKey;
    expect(apiKey).toBeDefined();
    expect(apiKey.length).toBeGreaterThan(10);
    expect(apiKey).toMatch(/^sk-ant-/);
  });

  it("should successfully connect to Claude API with the provided key", async () => {
    const apiKey = ENV.anthropicApiKey;
    if (!apiKey || apiKey.length < 10) {
      console.warn("Skipping live API test - no key available");
      return;
    }

    const client = new Anthropic({ apiKey });

    // Make a minimal API call to validate the key
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 20,
      messages: [{ role: "user", content: "Say hello in one word." }],
    });

    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0].type).toBe("text");
  }, 15000);
});
