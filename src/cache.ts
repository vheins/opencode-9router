import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import type { ModelConfig, ModelsDevEntry } from "./types.js";
import { DISCOVERY_CACHE_VERSION, MODELS_DEV_CACHE_TTL, MODELS_DEV_URL } from "./constants.js";
import { safeFilename } from "./utils.js";

/**
 * Versioned envelope persisted in discovery cache files. The version gate lets
 * a config-shape change invalidate entries written by older plugin versions.
 */
interface DiscoveryCacheEnvelope {
  v: number;
  models: Record<string, ModelConfig>;
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
export function readDiscoveryCache(
  baseURL: string,
  ttl: number,
  providerKey: string,
): Record<string, ModelConfig> | null {
  const cacheFile = discoveryCacheFile(baseURL, providerKey);
  try {
    if (existsSync(cacheFile)) {
      const stat = statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < ttl) {
        return parseDiscoveryCache(readFileSync(cacheFile, "utf-8"));
      }
    }
  } catch {
    // Corrupted or unreadable — ignore
  }
  return null;
}

/**
 * Parse a discovery cache file, accepting only entries written by the current
 * DISCOVERY_CACHE_VERSION. Legacy (bare, unversioned) or future entries are
 * treated as a miss so the model list is refetched with current logic.
 */
function parseDiscoveryCache(raw: string): Record<string, ModelConfig> | null {
  const parsed = JSON.parse(raw) as DiscoveryCacheEnvelope | Record<string, ModelConfig>;
  const envelope = parsed as DiscoveryCacheEnvelope;
  if (
    envelope &&
    typeof envelope === "object" &&
    envelope.v === DISCOVERY_CACHE_VERSION &&
    envelope.models &&
    typeof envelope.models === "object"
  ) {
    return envelope.models;
  }
  return null;
}

/**
 * Read a stale (expired) discovery cache entry as fallback.
 */
export function readStaleDiscoveryCache(
  baseURL: string,
  providerKey: string,
): Record<string, ModelConfig> | null {
  const cacheFile = discoveryCacheFile(baseURL, providerKey);
  try {
    if (existsSync(cacheFile)) {
      return parseDiscoveryCache(readFileSync(cacheFile, "utf-8"));
    }
  } catch {
    // Corrupted or unreadable — ignore
  }
  return null;
}

/**
 * Persist discovery results to cache (best-effort).
 */
export function writeDiscoveryCache(
  baseURL: string,
  models: Record<string, ModelConfig>,
  providerKey: string,
): void {
  const cacheFile = discoveryCacheFile(baseURL, providerKey);
  try {
    mkdirSync(cacheDir(), { recursive: true });
    const envelope: DiscoveryCacheEnvelope = { v: DISCOVERY_CACHE_VERSION, models };
    writeFileSync(cacheFile, JSON.stringify(envelope), "utf-8");
  } catch {
    // Cache write is best-effort
  }
}

// ── Models.dev Catalog Cache ────────────────────────────────

/**
 * Fetch the models.dev capability catalog, cached for MODELS_DEV_CACHE_TTL.
 * Returns the flattened entry list, or `null` when the catalog is unreachable
 * and no fresh cache exists.
 */
export async function fetchModelsDevCatalog(): Promise<ModelsDevEntry[] | null> {
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
export function flattenModelsDevCatalog(
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
