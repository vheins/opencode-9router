export declare const PLUGIN_NAME = "9router";
export declare const PROVIDER_DISPLAY_NAME = "9Router";
export declare const DEFAULT_BASE_URL = "http://localhost:20128";
export declare const DEFAULT_API_PATH = "/v1";
/**
 * Well-known 9Router models used as fallback when the API is unreachable.
 * Covers the most common providers and tiers routed through 9Router.
 */
export declare const FALLBACK_MODELS: Record<string, {
    name: string;
}>;
/** URL for the models.dev capability catalog. */
export declare const MODELS_DEV_URL = "https://models.dev/api.json";
/** Cache TTL for the models.dev catalog (5 minutes). */
export declare const MODELS_DEV_CACHE_TTL: number;
/** Timeout per-model info request (3 seconds). */
export declare const MODEL_INFO_TIMEOUT = 3000;
/** Max concurrent per-model info requests. */
export declare const MAX_CONCURRENT_INFO = 5;
/** Known provider prefixes in 9Router model IDs for human-readable naming. */
export declare const KNOWN_PROVIDER_PREFIXES: Record<string, string>;
