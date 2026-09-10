import { describe, expect, it } from "vitest";
import { effectiveModel } from "../src/lib/llm.js";
import {
  DEFAULT_CONFIG,
  OLLAMA_DEFAULT_MODEL,
  OPENCODE_ZEN_MODEL,
} from "../src/lib/constants.js";

describe("effectiveModel", () => {
  it("keeps explicit models per provider", () => {
    expect(
      effectiveModel({ ...DEFAULT_CONFIG, provider: "anthropic" }),
    ).toBe("claude-sonnet-4-6");
    expect(
      effectiveModel({
        ...DEFAULT_CONFIG,
        provider: "ollama",
        model: "llama3.1:8b",
      }),
    ).toBe("llama3.1:8b");
    expect(
      effectiveModel({
        ...DEFAULT_CONFIG,
        provider: "openrouter",
        model: "x/y:free",
      }),
    ).toBe("x/y:free");
  });

  it("falls back to free coder model for ollama when config still has cloud model", () => {
    expect(
      effectiveModel({ ...DEFAULT_CONFIG, provider: "ollama" }),
    ).toBe(OLLAMA_DEFAULT_MODEL);
    expect(
      effectiveModel({
        ...DEFAULT_CONFIG,
        provider: "ollama",
        model: "gpt-4o-mini",
      }),
    ).toBe(OLLAMA_DEFAULT_MODEL);
  });

  it("falls back to Big Pickle for opencode when config still has cloud model", () => {
    expect(
      effectiveModel({ ...DEFAULT_CONFIG, provider: "opencode" }),
    ).toBe(OPENCODE_ZEN_MODEL);
    expect(
      effectiveModel({
        ...DEFAULT_CONFIG,
        provider: "opencode",
        model: "gpt-4o-mini",
      }),
    ).toBe(OPENCODE_ZEN_MODEL);
    expect(
      effectiveModel({
        ...DEFAULT_CONFIG,
        provider: "opencode",
        model: "big-pickle",
      }),
    ).toBe("big-pickle");
  });
});
