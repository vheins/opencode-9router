import type { ModelConfig } from "./types.js";
import { readDiscoveryCache, readStaleDiscoveryCache, writeDiscoveryCache } from "./cache.js";
import { forceComboConfig, isComboModel, resolveCapabilitiesBatch } from "./capabilities.js";
import { ensureAPIPath, formatModelName } from "./utils.js";

// ── Model Discovery ─────────────────────────────────────────

/** Log function type shared by the discovery pipeline. */
export type DiscoveryLogger = (
  level: "info" | "warn" | "error" | "debug",
  message: string,
) => Promise<void>;

/**
 * Discover models from a 9Router-compatible API, enriching each model with
 * capabilities from the models.dev catalog and the per-model API. Results are
 * cached; an expired cache entry is used as fallback when the fetch fails.
 */
export async function discoverModels(
  baseURL: string,
  apiKey: string | undefined,
  cacheEnabled: boolean,
  cacheTTL: number,
  discoveryTimeout: number,
  providerKey: string,
  log: DiscoveryLogger,
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
      data?: Array<{ id: string; owned_by?: string }>;
    };
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error(`Empty or invalid response data from ${apiURL}/models`);
    }

    const models = Object.create(null) as Record<string, ModelConfig>;
    const modelIds: string[] = [];
    const comboIds = new Set<string>();
    for (const model of data.data) {
      models[model.id] = { name: formatModelName(model.id) };
      modelIds.push(model.id);
      if (isComboModel(model.id, model.owned_by)) {
        comboIds.add(model.id);
      }
    }

    // Enrich with capabilities
    const capabilities = await resolveCapabilitiesBatch(modelIds, apiURL, apiKey, comboIds);
    for (const [id, caps] of Object.entries(capabilities)) {
      if (models[id]) {
        Object.assign(models[id], caps);
      }
    }

    // Default: tool_call is true for API-discovered models
    for (const config of Object.values(models)) {
      config.tool_call = config.tool_call ?? true;
    }

    // Combos with no real capability info get forced multimodal defaults.
    for (const id of comboIds) {
      const config = models[id];
      if (config && !capabilities[id]) {
        Object.assign(config, forceComboConfig());
      }
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
