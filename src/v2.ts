import { Plugin, Provider } from "@opencode/plugin";
import type { PluginOptions } from "@opencode/plugin";
import {
  DEFAULT_BASE_URL,
  DISCOVERY_CACHE_TTL,
  DISCOVERY_TIMEOUT,
  PLUGIN_NAME,
  PROVIDER_DISPLAY_NAME,
} from "./constants.js";
import { discoverModels, type DiscoveryLogger } from "./discovery.js";
import { ensureAPIPath, normalizeBaseURL } from "./utils.js";
import { toModelInfos } from "./v2-map.js";

// ── OpenCode V2 Plugin ──────────────────────────────────────

/** Runtime package used for OpenAI-compatible providers in OpenCode V2. */
export const OPENAI_COMPATIBLE_PACKAGE = "@opencode/ai/providers/openai-compatible";

/** How often captured discovery data is refreshed and replayed. */
export const REFRESH_INTERVAL = 5 * 60 * 1000;

/** Minimal view of a listed provider record (unbranded ids from the client). */
interface ExistingProvider {
  id: string;
  name: string;
  settings?: Record<string, unknown>;
}

/** A single 9router-family provider target resolved from options or config. */
interface ProviderTarget {
  key: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  cacheEnabled: boolean;
  cacheTTL: number;
  discoveryTimeout: number;
}

/** Captured, pre-loaded discovery data replayed by the synchronous transform. */
interface CapturedProvider {
  key: string;
  info: Provider.Info;
  models: ReturnType<typeof toModelInfos>;
}

// ── Coercion helpers ────────────────────────────────────────

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

// ── Target resolution ───────────────────────────────────────

/**
 * Resolve the set of 9router-family providers to manage. Explicit plugin
 * options win, existing provider records (whose id starts with `9router`) are
 * merged in, and a default `9router` provider is registered when nothing else
 * is configured — mirroring the V1 config-hook fallback.
 */
function resolveTargets(
  existing: readonly ExistingProvider[],
  options: PluginOptions,
): ProviderTarget[] {
  const targets = new Map<string, ProviderTarget>();

  const optCache = asBoolean(options.cache) ?? true;
  const optCacheTTL = asNumber(options.cacheTTL) ?? DISCOVERY_CACHE_TTL;
  const optTimeout = asNumber(options.discoveryTimeout) ?? DISCOVERY_TIMEOUT;

  // 1. Explicit `providers` array from plugin options.
  const optProviders = Array.isArray(options.providers) ? options.providers : [];
  for (const raw of optProviders) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const key = asString(entry.key) ?? asString(entry.id) ?? PLUGIN_NAME;
    targets.set(key, {
      key,
      name:
        asString(entry.name) ??
        (key === PLUGIN_NAME ? PROVIDER_DISPLAY_NAME : key),
      baseURL: asString(entry.baseURL) ?? DEFAULT_BASE_URL,
      apiKey: asString(entry.apiKey),
      cacheEnabled: asBoolean(entry.cache) ?? optCache,
      cacheTTL: asNumber(entry.cacheTTL) ?? optCacheTTL,
      discoveryTimeout: asNumber(entry.discoveryTimeout) ?? optTimeout,
    });
  }

  // 2. Existing provider records for 9router-family providers.
  for (const info of existing) {
    const id = info?.id;
    if (typeof id !== "string" || !id.startsWith(PLUGIN_NAME)) continue;
    if (targets.has(id)) continue;
    const settings = (info.settings ?? {}) as Record<string, unknown>;
    targets.set(id, {
      key: id,
      name:
        asString(info.name) ?? (id === PLUGIN_NAME ? PROVIDER_DISPLAY_NAME : id),
      baseURL: asString(settings.baseURL) ?? DEFAULT_BASE_URL,
      apiKey: asString(settings.apiKey),
      cacheEnabled: optCache,
      cacheTTL: optCacheTTL,
      discoveryTimeout: optTimeout,
    });
  }

  // 3. Fallback: register the default provider from plugin options.
  if (targets.size === 0) {
    targets.set(PLUGIN_NAME, {
      key: PLUGIN_NAME,
      name: PROVIDER_DISPLAY_NAME,
      baseURL: asString(options.baseURL) ?? DEFAULT_BASE_URL,
      apiKey: asString(options.apiKey),
      cacheEnabled: optCache,
      cacheTTL: optCacheTTL,
      discoveryTimeout: optTimeout,
    });
  }

  return Array.from(targets.values());
}

/** Build the V2 provider info record for a target. */
function buildProviderInfo(
  key: string,
  name: string,
  apiURL: string,
  apiKey?: string,
): Provider.Info {
  return {
    ...Provider.Info.empty(Provider.ID.make(key)),
    name,
    activation: "enabled",
    package: OPENAI_COMPATIBLE_PACKAGE,
    settings: {
      baseURL: apiURL,
      ...(apiKey ? { apiKey } : {}),
    },
  };
}

/**
 * OpenCode V2 plugin for 9Router. Discovers models for every 9router-family
 * provider and registers them through a provider transform, refreshing
 * periodically via `ctx.provider.reload()`.
 */
export const nineRouterV2: Plugin.Plugin = Plugin.define({
  id: PLUGIN_NAME,
  async setup(ctx) {
    const log: DiscoveryLogger = async (level, message) => {
      const line = `[9router-provider] ${message}`;
      if (level === "error") {
        console.error(line);
      } else if (level === "warn") {
        console.warn(line);
      } else if (level === "info") {
        console.log(line);
      }
    };

    // Load existing providers up-front (transform callbacks stay synchronous).
    let existing: ExistingProvider[] = [];
    try {
      const listed = await ctx.provider.list();
      existing = listed.data.map((provider) => ({
        id: provider.id,
        name: provider.name,
        settings: provider.settings as Record<string, unknown> | undefined,
      }));
    } catch {
      // Provider listing is best-effort; fall back to options/default.
    }

    const targets = resolveTargets(existing, ctx.options);

    const discoverTargets = async (): Promise<CapturedProvider[]> => {
      const results = await Promise.all(
        targets.map(async (target): Promise<CapturedProvider> => {
          const normalizedURL = normalizeBaseURL(target.baseURL);
          const apiURL = ensureAPIPath(normalizedURL);
          const models = await discoverModels(
            normalizedURL,
            target.apiKey,
            target.cacheEnabled,
            target.cacheTTL,
            target.discoveryTimeout,
            target.key,
            log,
          );
          if (models) {
            log(
              "info",
              `[${target.key}] Discovered ${Object.keys(models).length} models from ${apiURL}`,
            );
          } else {
            log(
              "warn",
              `[${target.key}] Failed to discover models from ${apiURL}. Check if the service is running and accessible.`,
            );
          }
          return {
            key: target.key,
            info: buildProviderInfo(
              target.key,
              target.name,
              apiURL,
              target.apiKey,
            ),
            models: toModelInfos(target.key, models ?? {}),
          };
        }),
      );
      return results;
    };

    // Captured source: loaded before registration, refreshed on an interval.
    const source = { providers: await discoverTargets() };

    await ctx.provider.transform((editor) => {
      for (const provider of source.providers) {
        if (editor.get(provider.key)) {
          // Existing provider (e.g. user-defined `providers.9router`): update
          // its info so it gains the required OpenAI-compatible package and
          // baseURL, then replace its discovered model inventory.
          editor.update(provider.key, (info) => {
            info.package = OPENAI_COMPATIBLE_PACKAGE;
            info.activation = "enabled";
            info.settings = {
              ...(info.settings ?? {}),
              ...provider.info.settings,
            };
          });
          editor.models.set(provider.key, provider.models);
        } else {
          editor.add({ info: provider.info, models: provider.models });
        }
      }
    });

    const refresh = async () => {
      source.providers = await discoverTargets();
      await ctx.provider.reload();
    };

    const timer = setInterval(() => {
      refresh().catch((err) => {
        console.error(
          `[9router-provider] Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, REFRESH_INTERVAL);

    return () => {
      clearInterval(timer);
    };
  },
});
