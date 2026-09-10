// ── Shared Types ───────────────────────────────────────────

/**
 * Optional token limit values carried by 9Router responses and the models.dev
 * catalog. Number and string forms are both possible (values arrive via JSON).
 */
export type TokenLimitValue = number | string;

/**
 * Token limits OpenCode receives per model. OpenCode computes the context-usage
 * percentage shown in the UI from `context`; without it, usage always shows 0%.
 * Both fields are optional because a provider may only report one of them.
 */
export type ModelLimits = {
  context?: number;
  output?: number;
};

/** OpenCode model config fragment generated per discovered model. */
export type ModelConfig = {
  name: string;
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  modalities?: {
    input: Array<"text" | "audio" | "image" | "video" | "pdf">;
    output: Array<"text" | "audio" | "image" | "video" | "pdf">;
  };
  interleaved?: true | { field: "reasoning" | "reasoning_content" | "reasoning_details" };
  limit?: ModelLimits;
  variants?: Record<string, Record<string, unknown>>;
  search?: boolean;
  context_length?: number;
  max_completion_tokens?: number;
};

/**
 * Model metadata returned by the 9Router `/models/info` endpoint. Capability
 * flags live under `capabilities`; token limits appear both nested there and
 * as top-level `context_length` / `max_completion_tokens` on bulk responses.
 */
export interface RouterModelInfo {
  id: string;
  capabilities?: {
    vision?: boolean;
    audioInput?: boolean;
    tools?: boolean;
    reasoning?: boolean;
    search?: boolean;
    contextWindow?: TokenLimitValue;
    maxOutput?: TokenLimitValue;
  };
  context_length?: TokenLimitValue;
  max_completion_tokens?: TokenLimitValue;
}

/**
 * Single entry of the models.dev capability catalog. Shape mirrors a subset
 * of RouterModelInfo plus catalog-specific fields (`attachment`, modalities).
 */
export interface ModelsDevEntry {
  id: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  capabilities?: RouterModelInfo["capabilities"];
  modalities?: { input?: string[]; output?: string[] };
  limit?: ModelLimits;
  [key: string]: unknown;
}
