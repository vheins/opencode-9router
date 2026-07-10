export const PLUGIN_NAME = "9router";
export const PROVIDER_DISPLAY_NAME = "9Router";
export const DEFAULT_BASE_URL = "http://localhost:20128";
export const DEFAULT_API_PATH = "/v1";
/**
 * Well-known 9Router models used as fallback when the API is unreachable.
 * Covers the most common providers and tiers routed through 9Router.
 */
export const FALLBACK_MODELS = {
    // --- Claude Code (Subscription) ---
    "cc/claude-opus-4-7": { name: "Claude Opus 4.7 (Claude Code)" },
    "cc/claude-opus-4-6": { name: "Claude Opus 4.6 (Claude Code)" },
    "cc/claude-sonnet-4-6": { name: "Claude Sonnet 4.6 (Claude Code)" },
    "cc/claude-haiku-4-5-20251001": { name: "Claude Haiku 4.5 (Claude Code)" },
    // --- OpenCode / Codex (Subscription) ---
    "cx/gpt-5.5": { name: "GPT-5.5 (Codex)" },
    "cx/gpt-5.4": { name: "GPT-5.4 (Codex)" },
    // --- GitHub Copilot (Subscription) ---
    "gh/gpt-5.4": { name: "GPT-5.4 (Copilot)" },
    "gh/claude-sonnet-4.6": { name: "Claude Sonnet 4.6 (Copilot)" },
    // --- Kiro AI (FREE) ---
    "kr/claude-sonnet-4.5": { name: "Claude Sonnet 4.5 (Kiro Free)" },
    "kr/claude-haiku-4.5": { name: "Claude Haiku 4.5 (Kiro Free)" },
    "kr/glm-5": { name: "GLM-5 (Kiro Free)" },
    "kr/MiniMax-M2.5": { name: "MiniMax M2.5 (Kiro Free)" },
    "kr/qwen3-coder-next": { name: "Qwen3 Coder Next (Kiro Free)" },
    "kr/deepseek-3.2": { name: "DeepSeek 3.2 (Kiro Free)" },
    // --- OpenCode Free (FREE) ---
    "oc/auto": { name: "OpenCode Free (Auto)" },
    // --- Vertex AI ($300 credits) ---
    "vertex/gemini-3.1-pro-preview": { name: "Gemini 3.1 Pro (Vertex)" },
    "vertex/gemini-3-flash-preview": { name: "Gemini 3 Flash (Vertex)" },
    // --- GLM (Cheap, $0.6/1M) ---
    "glm/glm-5.1": { name: "GLM-5.1" },
    "glm/glm-5": { name: "GLM-5" },
    "glm/glm-4.7": { name: "GLM-4.7" },
    // --- MiniMax (Cheapest, $0.2/1M) ---
    "minimax/MiniMax-M2.7": { name: "MiniMax M2.7" },
    "minimax/MiniMax-M2.5": { name: "MiniMax M2.5" },
    // --- Kimi ($9/mo flat) ---
    "kimi/kimi-k2.5": { name: "Kimi K2.5" },
    "kimi/kimi-k2.5-thinking": { name: "Kimi K2.5 (Thinking)" },
    // --- Cursor (Subscription) ---
    "cu/claude-4.6-opus-max": { name: "Claude 4.6 Opus Max (Cursor)" },
    // --- Standard Key Providers ---
    "deepseek/deepseek-chat": { name: "DeepSeek Chat" },
    "groq/llama-4.5-70b": { name: "Llama 4.5 70B (Groq)" },
};
/** URL for the models.dev capability catalog. */
export const MODELS_DEV_URL = "https://models.dev/api.json";
/** Cache TTL for the models.dev catalog (5 minutes). */
export const MODELS_DEV_CACHE_TTL = 5 * 60 * 1000;
/** Timeout per-model info request (3 seconds). */
export const MODEL_INFO_TIMEOUT = 3000;
/** Max concurrent per-model info requests. */
export const MAX_CONCURRENT_INFO = 5;
/** Known provider prefixes in 9Router model IDs for human-readable naming. */
export const KNOWN_PROVIDER_PREFIXES = {
    "cc/": "Claude Code",
    "cx/": "Codex",
    "gh/": "GitHub Copilot",
    "kr/": "Kiro AI",
    "oc/": "OpenCode Free",
    "vertex/": "Vertex AI",
    "vertex-partner/": "Vertex Partner",
    "glm/": "GLM",
    "minimax/": "MiniMax",
    "kimi/": "Kimi",
    "cu/": "Cursor",
    "gc/": "Gemini CLI",
    "if/": "iFlow",
    "qw/": "Qwen",
    "openrouter/": "OpenRouter",
    "deepseek/": "DeepSeek",
    "groq/": "Groq",
};
