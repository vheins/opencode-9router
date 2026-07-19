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
import { homedir, tmpdir } from "node:os";

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
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  capabilities?: RouterModelInfo["capabilities"];
  modalities?: { input?: string[]; output?: string[] };
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

/**
 * Sanitize a string to contain only safe filename characters.
 * Replaces any character that is NOT alphanumeric, dash, underscore, or dot with an underscore.
 */
function safeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
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
  try {
    if (process.env.XDG_CACHE_HOME) {
      return `${process.env.XDG_CACHE_HOME}/opencode-9router`;
    }
    const home = homedir();
    if (home) {
      return `${home}/.cache/opencode-9router`;
    }
  } catch {
    // Fall through to tmpdir
  }
  return `${tmpdir()}/opencode-9router`;
}

/**
 * Unique, filesystem-safe cache key for a given baseURL.
 */
function discoveryCacheKey(baseURL: string): string {
  return Buffer.from(baseURL).toString("base64url");
}

/**
 * Cache file path for a provider's discovery result, prefixed with the
 * provider key so cache files are human-identifiable.
 */
function discoveryCacheFile(baseURL: string, providerKey: string): string {
  return `${cacheDir()}/discovery-${safeFilename(providerKey)}-${discoveryCacheKey(baseURL)}.json`;
}

/**
 * Read a valid (fresh) discovery cache entry.
 * Returns `null` if missing, stale, or corrupted.
 */
function readDiscoveryCache(
  baseURL: string,
  ttl: number,
  providerKey: string,
): Record<string, ModelConfig> | null {
  const cacheFile = discoveryCacheFile(baseURL, providerKey);
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
  providerKey: string,
): Record<string, ModelConfig> | null {
  const cacheFile = discoveryCacheFile(baseURL, providerKey);
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
  providerKey: string,
): void {
  const cacheFile = discoveryCacheFile(baseURL, providerKey);
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
  retries = 1,
): Promise<RouterModelInfo | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
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
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  return null;
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
  const cacheDirPath = cacheDir();
  const cacheFile = `${cacheDirPath}/models-dev.json`;
  const url = process.env.OPENCODE_MODELS_URL || MODELS_DEV_URL;

  // Try cache — raw API response cached as-is, flattened on read
  try {
    if (existsSync(cacheFile)) {
      const stat = statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < MODELS_DEV_CACHE_TTL) {
        const content = readFileSync(cacheFile, "utf-8");
        const parsed = JSON.parse(content);
        // Old (pre-v0.7.7) caches stored a flat array — treat as miss
        if (!Array.isArray(parsed)) {
          return flattenModelsDevCatalog(parsed);
        }
        // Fall through to re-fetch if array (old format)
      }
    }
  } catch {
    // Cache miss or invalid — continue to fetch
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const raw = await response.json() as Record<string, { models?: Record<string, ModelsDevEntry> }>;
    const flattened = flattenModelsDevCatalog(raw);

    // Best-effort cache write: store raw dict, not flattened array
    try {
      mkdirSync(cacheDirPath, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(raw), "utf-8");
    } catch {
      // Cache write is optional
    }

    return flattened;
  } catch {
    return null;
  }
}

/**
 * models.dev/api.json returns a dict of providers, each with a nested
 * models dict. Flatten into a list of { id, capabilities } entries.
 */
function flattenModelsDevCatalog(
  raw: Record<string, { models?: Record<string, ModelsDevEntry> }>,
): ModelsDevEntry[] {
  const result: ModelsDevEntry[] = [];
  for (const provider of Object.values(raw)) {
    if (!provider?.models) continue;
    for (const entry of Object.values(provider.models)) {
      if (entry?.id) {
        result.push(entry);
      }
    }
  }
  return result;
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
    const inputModalities = bestMatch.modalities?.input ?? [];
    return {
      id: bestMatch.id,
      capabilities: {
        vision: bestMatch.attachment ?? inputModalities.includes("image"),
        tools: bestMatch.tool_call ?? false,
        reasoning: bestMatch.reasoning ?? false,
        audioInput: inputModalities.includes("audio"),
      },
    };
  }

  return null;
}

const CAPABILITY_BUDGET_MS = 10000;

async function resolveCapabilitiesBatch(
  modelIds: string[],
  apiURL: string,
  apiKey?: string,
): Promise<Record<string, Partial<ModelConfig>>> {
  const capabilities: Record<string, Partial<ModelConfig>> = {};

  // 1. Fetch models.dev catalog first (cached 1h → near-instant most runs)
  const catalog = await fetchModelsDevCatalog();

  // 2. Resolve from catalog, queue remainder for API
  const pendingIds: string[] = [];
  for (const id of modelIds) {
    let resolved = false;
    if (catalog) {
      const match = findModelsDevMatch(id, catalog);
      if (match?.capabilities) {
        capabilities[id] = mapRouterCapabilities(match);
        resolved = true;
      }
    }
    if (!resolved) {
      pendingIds.push(id);
    }
  }

  // 3. Only hit per-model API for models not in catalog, with time budget
  if (pendingIds.length === 0) return capabilities;

  const startTime = Date.now();
  for (let i = 0; i < pendingIds.length; i += MAX_CONCURRENT_INFO) {
    if (Date.now() - startTime > CAPABILITY_BUDGET_MS) {
      // Budget exhausted — give up on remaining models, fallback will serve them
      break;
    }
    const batch = pendingIds.slice(i, i + MAX_CONCURRENT_INFO);
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

  return capabilities;
}

// ── Model Discovery ─────────────────────────────────────────

async function discoverModels(
  baseURL: string,
  apiKey: string | undefined,
  cacheEnabled: boolean,
  cacheTTL: number,
  discoveryTimeout: number,
  providerKey: string,
  log: (level: "info" | "warn" | "error" | "debug", message: string) => Promise<void>,
): Promise<Record<string, ModelConfig> | null> {
  // ── Cache hit: return fresh cached models ──
  if (cacheEnabled) {
    const cached = readDiscoveryCache(baseURL, cacheTTL, providerKey);
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
    if (!response.ok) {
      throw new Error(`Fetch not OK: ${response.status} ${response.statusText}`);
    }
    log("info", `[discovery] Fetch OK (${response.status}) for ${baseURL}`);

    const data = (await response.json()) as {
      data?: Array<{ id: string }>;
    };
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error(`Empty or invalid response data from ${apiURL}/models`);
    }

    const models = Object.create(null) as Record<string, ModelConfig>;
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
      writeDiscoveryCache(baseURL, models, providerKey);
      log("info", `[discovery] Cached ${Object.keys(models).length} models for ${baseURL}`);
    }

    return models;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log("warn", `[discovery] Fetch threw for ${apiURL}/models: ${msg}`);
    // ── Stale cache fallback: return expired cache if fetch failed ──
    log("info", `[discovery] Fetch failed for ${baseURL}, trying stale cache fallback`);
    if (cacheEnabled) {
      const stale = readStaleDiscoveryCache(baseURL, providerKey);
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

          const normalizedURL = normalizeBaseURL(baseURL);
          const apiURL = ensureAPIPath(normalizedURL);

          // Per-provider cache configuration
          const cacheEnabled = (options?.cache as boolean) ?? true;
          const cacheTTL = (options?.cacheTTL as number) ?? DISCOVERY_CACHE_TTL;
          const discoveryTimeout = (options?.discoveryTimeout as number) ?? DISCOVERY_TIMEOUT;

          const discovered = await discoverModels(normalizedURL, apiKey, cacheEnabled, cacheTTL, discoveryTimeout, key, log);

          const entry = provider[key] as Record<string, unknown>;
          entry.npm ??= "@ai-sdk/openai-compatible";
          entry.name ??= key;
          entry.api = apiURL;
          entry.options = { ...(entry.options as Record<string, unknown>), baseURL: apiURL };
          entry.models = discovered ?? {};

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
