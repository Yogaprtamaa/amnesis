import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AmnesisConfig } from "./constants.js";
import {
  OLLAMA_DEFAULT_MODEL,
  OPENCODE_ZEN_BASE_URL,
  OPENCODE_ZEN_MODEL,
  OPENROUTER_FREE_MODEL,
  buildWrapupPrompt,
  type WrapupLLMResult,
} from "./constants.js";

export type LlmCaller = (
  prompt: string,
  config: AmnesisConfig,
) => Promise<string>;

// Overridable in tests
export let llmCaller: LlmCaller = defaultLlmCaller;

export function setLlmCaller(fn: LlmCaller): void {
  llmCaller = fn;
}

/**
 * Resolve model ID yang beneran valid buat tiap provider.
 * Config default nyimpan model Anthropic — kalau user ganti provider ke
 * yang gratis tanpa ganti model, arahkan ke default gratis yang masuk akal
 * daripada error / pull model ngawur.
 */
export function effectiveModel(config: AmnesisConfig): string {
  if (config.provider === "ollama") {
    const m = config.model || "";
    if (
      !m ||
      m.includes("/") ||
      m.startsWith("claude-") ||
      m.startsWith("gpt-")
    ) {
      return OLLAMA_DEFAULT_MODEL;
    }
    return m;
  }
  if (config.provider === "openrouter" && !config.model) {
    return OPENROUTER_FREE_MODEL;
  }
  if (config.provider === "opencode") {
    const m = config.model || "";
    if (!m || m.startsWith("claude-") || m.startsWith("gpt-")) {
      return OPENCODE_ZEN_MODEL;
    }
    return m; // model Zen lain (lihat toggle di dashboard) bisa diisi manual
  }
  return config.model;
}

function resolveApiKey(config: AmnesisConfig): string {
  const key = process.env[config.apiKeyEnv] ?? "";
  if (!key && config.provider !== "ollama") {
    console.error(
      `Missing API key: env var ${config.apiKeyEnv} is empty.\n` +
        `Set it, e.g.: export ${config.apiKeyEnv}=<your-key>`,
    );
    process.exitCode = 1;
    throw new Error(`Missing API key env var ${config.apiKeyEnv}`);
  }
  return key;
}

async function defaultLlmCaller(
  prompt: string,
  config: AmnesisConfig,
): Promise<string> {
  const model = effectiveModel(config);
  if (config.provider === "ollama") {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
    });
    if (!res.ok) throw new Error(`ollama error: ${res.status}`);
    const data = (await res.json()) as { response?: string };
    return data.response ?? "";
  }
  if (config.provider === "openrouter") {
    // OpenAI-compatible endpoint; model ":free" = gratis (key gratis juga).
    const key = resolveApiKey(config);
    const client = new OpenAI({
      apiKey: key,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0]?.message?.content ?? "";
  }
  if (config.provider === "opencode") {
    // OpenCode Zen (OpenAI-compatible). Big Pickle gratis/unlimited.
    // Key dari dashboard OpenCode → API Keys.
    const key = resolveApiKey(config);
    const client = new OpenAI({
      apiKey: key,
      baseURL: OPENCODE_ZEN_BASE_URL,
    });
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0]?.message?.content ?? "";
  }
  if (config.provider === "openai") {
    const key = resolveApiKey(config);
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0]?.message?.content ?? "";
  }
  // anthropic default
  const key = resolveApiKey(config);
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: model || "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  if (block && block.type === "text") return block.text;
  return "";
}

function stripFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m?.[1]?.trim() ?? t;
}

export function parseLlmJson(raw: string): WrapupLLMResult {
  const parsed = JSON.parse(stripFences(raw)) as WrapupLLMResult;
  if (typeof parsed.state_md_updated !== "string") {
    throw new Error("LLM response missing state_md_updated");
  }
  return {
    state_md_updated: parsed.state_md_updated,
    session_summary: parsed.session_summary ?? "(no summary)",
    should_create_adr: Boolean(parsed.should_create_adr),
    adr_title: parsed.adr_title ?? null,
  };
}

export async function callWrapupLlm(
  stateMd: string,
  diff: string,
  commitMessage: string,
  config: AmnesisConfig,
): Promise<WrapupLLMResult> {
  const prompt = buildWrapupPrompt(stateMd, diff, commitMessage);
  let raw = await llmCaller(prompt, config);
  try {
    return parseLlmJson(raw);
  } catch {
    // retry 1x with stricter instruction
    raw = await llmCaller(
      prompt + '\n\nIMPORTANT: output ONLY valid JSON, no fences, no preamble.',
      config,
    );
    return parseLlmJson(raw); // throws if still invalid -> caller falls back
  }
}
