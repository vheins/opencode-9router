import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  DEFAULT_API_PATH,
  DEFAULT_BASE_URL,
  DISCOVERY_CACHE_TTL,
  DISCOVERY_TIMEOUT,
  KNOWN_PROVIDER_PREFIXES,
  MAX_CONCURRENT_INFO,
  MODEL_INFO_TIMEOUT,
  MODELS_DEV_CACHE_TTL,
  MODELS_DEV_URL,
  PLUGIN_NAME,
  PROVIDER_DISPLAY_NAME,
} from "./constants.js";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

// ── Types ──────────────────────────────────────────────────

type ModelConfig = {
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
};

interface RouterModelInfo {
  id: string;
  capabilities?: {
    vision?: boolean;
    audioInput?: boolean;
    tools?: boolean;
    reasoning?: boolean;
    search?: boolean;
  };
}

interface ModelsDevEntry {
  id: string;
  capabilities?: RouterModelInfo["capabilities"];
  [key: string]: unknown;
}

// ── Utility Functions ──────────────────────────────────────

function formatModelName(modelId: string): string {
  for (const [prefix, provider] of Object.entries(KNOWN_PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) {
      return `${modelId.slice(prefix.length)} (${provider})`;
    }
  }
  return modelId;
}

function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, "");
}

function ensureAPIPath(baseURL: string): string {
  return baseURL.endsWith(DEFAULT_API_PATH) ? baseURL : `${baseURL}${DEFAULT_API_PATH}`;
}

// ── Discovery Cache ─────────────────────────────────────────

/**
 * Directory used for all 9router cache files.
 */
function cacheDir(): string {
  return `${process.env.HOME}/.cache/opencode-9router`;
}

/**
 * Unique, filesystem-safe cache key for a given baseURL.
 */
function discoveryCacheKey(baseURL: string): string {
  return Buffer.from(baseURL).toString("base64url");
}

/**
 * Read a valid (fresh) discovery cache entry.
 * Returns `null` if missing, stale, or corrupted.
 */
function readDiscoveryCache(
  baseURL: string,
  ttl: number,
): Record<string, ModelConfig> | null {
  const cacheFile = `${cacheDir()}/discovery-${discoveryCacheKey(baseURL)}.json`;
  try {
    if (existsSync(cacheFile)) {
      const stat = statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < ttl) {
        return JSON.parse(readFileSync(cacheFile, "utf-8")) as Record<string, ModelConfig>;
      }
    }
  } catch {
    // Corrupted or unreadable — ignore
  }
  return null;
}

/**
 * Read a stale (expired) discovery cache entry as fallback.
 */
function readStaleDiscoveryCache(
  baseURL: string,
): Record<string, ModelConfig> | null {
  const cacheFile = `${cacheDir()}/discovery-${discoveryCacheKey(baseURL)}.json`;
  try {
    if (existsSync(cacheFile)) {
      return JSON.parse(readFileSync(cacheFile, "utf-8")) as Record<string, ModelConfig>;
    }
  } catch {
    // Corrupted or unreadable — ignore
  }
  return null;
}

/**
 * Persist discovery results to cache (best-effort).
 */
function writeDiscoveryCache(
  baseURL: string,
  models: Record<string, ModelConfig>,
): void {
  const cacheFile = `${cacheDir()}/discovery-${discoveryCacheKey(baseURL)}.json`;
  try {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(models), "utf-8");
  } catch {
    // Cache write is best-effort
  }
}

// ── Capability Resolution ──────────────────────────────────

async function fetchModelInfo(
  apiURL: string,
  modelId: string,
  apiKey?: string,
): Promise<RouterModelInfo | null> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const response = await fetch(
      `${apiURL}/models/info?id=${encodeURIComponent(modelId)}`,
      {
        signal: AbortSignal.timeout(MODEL_INFO_TIMEOUT),
        headers,
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as RouterModelInfo;
  } catch {
    return null;
  }
}

function mapRouterCapabilities(info: RouterModelInfo): Partial<ModelConfig> {
  const config: Partial<ModelConfig> = {};
  const inputModalities: Set<"text" | "audio" | "image" | "video" | "pdf"> = new Set(["text"]);

  if (info.capabilities) {
    if (info.capabilities.vision) {
      config.attachment = true;
      inputModalities.add("image");
    }
    if (info.capabilities.tools) {
      config.tool_call = true;
    }
    if (info.capabilities.reasoning) {
      config.reasoning = true;
    }
    if (info.capabilities.audioInput) {
      inputModalities.add("audio");
    }
  }

  if (inputModalities.size > 1) {
    config.modalities = { input: Array.from(inputModalities), output: ["text"] };
  }

  return config;
}

async function fetchModelsDevCatalog(): Promise<ModelsDevEntry[] | null> {
  const cacheDir = `${process.env.HOME}/.cache/opencode-9router`;
  const cacheFile = `${cacheDir}/models-dev.json`;
  const url = process.env.OPENCODE_MODELS_URL || MODELS_DEV_URL;

  // Try cache (respect TTL via file mtime)
  try {
    if (existsSync(cacheFile)) {
      const stat = statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < MODELS_DEV_CACHE_TTL) {
        const content = readFileSync(cacheFile, "utf-8");
        return JSON.parse(content) as ModelsDevEntry[];
      }
    }
  } catch {
    // Cache miss or invalid — continue to fetch
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = (await response.json()) as ModelsDevEntry[];

    // Best-effort cache write
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(data), "utf-8");
    } catch {
      // Cache write is optional
    }

    return data;
  } catch {
    return null;
  }
}

function findModelsDevMatch(
  modelId: string,
  catalog: ModelsDevEntry[],
): RouterModelInfo | null {
  // Known prefixes to strip from model IDs before matching
  const stripPrefixes = [
    ...Object.keys(KNOWN_PROVIDER_PREFIXES),
    "nvidia/",
    "cmc/",
    "azure/",
    "aws/",
    "gcp/",
  ];

  let stripped = modelId;
  for (const prefix of stripPrefixes) {
    if (modelId.startsWith(prefix)) {
      stripped = modelId.slice(prefix.length);
      break;
    }
  }

  const normalized = stripped.toLowerCase().replace(/\./g, "-");

  let bestMatch: ModelsDevEntry | null = null;

  for (const entry of catalog) {
    const catalogId = typeof entry.id === "string"
      ? entry.id.toLowerCase().replace(/\./g, "-")
      : "";
    if (catalogId.endsWith(normalized)) {
      bestMatch = entry;
      break;
    }
    if (catalogId.includes(normalized) && !bestMatch) {
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    return {
      id: bestMatch.id,
      capabilities: bestMatch.capabilities,
    };
  }

  return null;
}

async function resolveCapabilitiesBatch(
  modelIds: string[],
  apiURL: string,
  apiKey?: string,
): Promise<Record<string, Partial<ModelConfig>>> {
  // Start catalog fetch in parallel with per-model requests
  const catalogPromise = fetchModelsDevCatalog();
  const capabilities: Record<string, Partial<ModelConfig>> = {};

  // Try per-model API in batches of MAX_CONCURRENT_INFO
  for (let i = 0; i < modelIds.length; i += MAX_CONCURRENT_INFO) {
    const batch = modelIds.slice(i, i + MAX_CONCURRENT_INFO);
    const results = await Promise.allSettled(
      batch.map((id) => fetchModelInfo(apiURL, id, apiKey)),
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value) {
        capabilities[batch[j]] = mapRouterCapabilities(result.value);
      }
    }
  }

  // Fallback: models.dev catalog for models without API capabilities
  const catalog = await catalogPromise;
  if (catalog) {
    for (const modelId of modelIds) {
      if (!capabilities[modelId]) {
        const match = findModelsDevMatch(modelId, catalog);
        if (match) {
          capabilities[modelId] = mapRouterCapabilities(match);
        }
      }
    }
  }

  return capabilities;
}

// ── Model Discovery ─────────────────────────────────────────

async function discoverModels(
  baseURL: string,
  apiKey: string | undefined,
  cacheEnabled: boolean,
  cacheTTL: number,
  discoveryTimeout: number,
  log: (level: "info" | "warn" | "error" | "debug", message: string) => Promise<void>,
): Promise<Record<string, ModelConfig> | null> {
  // ── Cache hit: return fresh cached models ──
  if (cacheEnabled) {
    const cached = readDiscoveryCache(baseURL, cacheTTL);
    if (cached) {
      log("info", `[discovery] Cache HIT for ${baseURL} (${Object.keys(cached).length} models)`);
      return cached;
    }
  }
  log("info", `[discovery] Cache MISS for ${baseURL}, fetching with ${discoveryTimeout}ms timeout`);

  const apiURL = ensureAPIPath(baseURL);
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    log("info", `[discovery] Fetching ${apiURL}/models with ${discoveryTimeout}ms timeout`);
    const response = await fetch(`${apiURL}/models`, {
      signal: AbortSignal.timeout(discoveryTimeout),
      headers,
    });
    if (!response.ok) return null;
    log("info", `[discovery] Fetch OK (${response.status}) for ${baseURL}`);

    const data = (await response.json()) as {
      data?: Array<{ id: string }>;
    };
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      return null;
    }

    const models: Record<string, ModelConfig> = {};
    const modelIds: string[] = [];
    for (const model of data.data) {
      models[model.id] = { name: formatModelName(model.id) };
      modelIds.push(model.id);
    }

    // Enrich with capabilities
    const capabilities = await resolveCapabilitiesBatch(modelIds, apiURL, apiKey);
    for (const [id, caps] of Object.entries(capabilities)) {
      if (models[id]) {
        Object.assign(models[id], caps);
      }
    }

    // Default: tool_call is true for API-discovered models
    for (const config of Object.values(models)) {
      config.tool_call = config.tool_call ?? true;
    }

    // ── Cache write on success ──
    if (cacheEnabled) {
      writeDiscoveryCache(baseURL, models);
      log("info", `[discovery] Cached ${Object.keys(models).length} models for ${baseURL}`);
    }

    return models;
  } catch {
    // ── Stale cache fallback: return expired cache if fetch failed ──
    log("info", `[discovery] Fetch failed for ${baseURL}, trying stale cache fallback`);
    if (cacheEnabled) {
      const stale = readStaleDiscoveryCache(baseURL);
      if (stale) {
        log("info", `[discovery] Stale cache fallback for ${baseURL} (${Object.keys(stale).length} models)`);
        return stale;
      }
      log("info", `[discovery] No stale cache for ${baseURL}, returning null`);
    }

    return null;
  }
}

// ── Plugin ──────────────────────────────────────────────────

export const NineRouterPlugin: Plugin = async ({ client }: PluginInput) => {
  const log = async (level: "info" | "warn" | "error" | "debug", message: string) => {
    try {
      await client.app.log({
        body: {
          service: "9router-provider",
          level,
          message,
        },
      });
    } catch {
      // Logging is best-effort
    }
  };

  return {
    config: async (config) => {
      config.provider ??= {};
      const provider = config.provider;

      // Collect all existing providers whose key starts with "9router"
      const providerKeys = Object.keys(provider).filter((k) =>
        k.startsWith("9router"),
      );

      // Backward compat: if no 9router-family providers exist, register the default one
      if (providerKeys.length === 0) {
        config.provider[PLUGIN_NAME] = {
          npm: "@ai-sdk/openai-compatible",
          name: PROVIDER_DISPLAY_NAME,
          options: {
            baseURL: DEFAULT_BASE_URL,
          },
          models: {},
        };
        providerKeys.push(PLUGIN_NAME);
      }

      // Process each 9router-family provider independently
      const results = await Promise.allSettled(
        providerKeys.map(async (key) => {
          const existing = provider[key];
          const options = existing?.options as Record<string, unknown> | undefined;
          const baseURL = (options?.baseURL as string) ?? DEFAULT_BASE_URL;
          const apiKey = options?.apiKey as string | undefined;
          const existingName = existing?.name as string | undefined;

          const normalizedURL = normalizeBaseURL(baseURL);
          const apiURL = ensureAPIPath(normalizedURL);

          // Per-provider cache configuration
          const cacheEnabled = (options?.cache as boolean) ?? true;
          const cacheTTL = (options?.cacheTTL as number) ?? DISCOVERY_CACHE_TTL;
          const discoveryTimeout = (options?.discoveryTimeout as number) ?? DISCOVERY_TIMEOUT;

          const discovered = await discoverModels(normalizedURL, apiKey, cacheEnabled, cacheTTL, discoveryTimeout, log);

          provider[key] = {
            npm: existing?.npm ?? "@ai-sdk/openai-compatible",
            name: existingName ?? key,
            options: {
              ...(existing?.options as Record<string, unknown>),
              baseURL: apiURL,
            },
            models: discovered ?? {},
          };

          return { key, discovered, apiURL };
        }),
      );

      // Log results
      for (const result of results) {
        if (result.status === "fulfilled") {
          const { key, discovered, apiURL } = result.value;
          if (discovered) {
            await log(
              "info",
              `[${key}] Discovered ${Object.keys(discovered).length} models from ${apiURL}`,
            );
          } else {
            await log(
              "warn",
              `[${key}] Failed to discover models from ${apiURL}. Check if the service is running and accessible.`,
            );
          }
        } else {
          await log("error", `Provider pipeline error: ${result.reason}`);
        }
      }
    },
  } satisfies Hooks;
};
