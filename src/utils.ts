import type { TokenLimitValue } from "./types.js";
import { DEFAULT_API_PATH, KNOWN_PROVIDER_PREFIXES } from "./constants.js";

// ── Utility Functions ──────────────────────────────────────

/**
 * Format a model ID for display, replacing a known provider prefix with its
 * human-readable name (e.g. "cc/the model" → "the model ([CC])").
 */
export function formatModelName(modelId: string): string {
  for (const [prefix, provider] of Object.entries(KNOWN_PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) {
      return `${modelId.slice(prefix.length)} (${provider})`;
    }
  }
  return modelId;
}

/**
 * Sanitize a string to contain only safe filename characters.
 * Replaces any character that is NOT alphanumeric, dash, underscore, or dot with an underscore.
 */
export function safeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Strip trailing slashes from a base URL. */
export function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Append the default API path to a base URL when it is not already present. */
export function ensureAPIPath(baseURL: string): string {
  return baseURL.endsWith(DEFAULT_API_PATH) ? baseURL : `${baseURL}${DEFAULT_API_PATH}`;
}

/**
 * Coerce a token-limit value into a positive finite integer, or undefined when
 * the value is absent or not a valid positive integer (0, negative, NaN,
 * Infinity, float, or a non-numeric string are all rejected).
 */
export function toPositiveInt(value: TokenLimitValue | undefined): number | undefined {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isSafeInteger(num) && (num as number) > 0 ? (num as number) : undefined;
}
