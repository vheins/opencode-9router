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

/** Bounded retries for config providers registered after external plugin setup. */
export const CONFIG_PROVIDER_RETRY_DELAYS = [0, 100, 500, 1500, 5000] as const;

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

/** Coerce an unknown value to a non-empty string when possible. */
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Coerce an unknown value to a finite number when possible. */
function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Coerce an unknown value to a boolean when possible. */
function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Check whether a value is a non-null object with string keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extract a provider target from a V2 ProviderRecord or a legacy record. */
function toExistingProvider(value: unknown): ExistingProvider | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const provider = isRecord(value.provider) ? value.provider : value;
  const id = asString(provider.id);
  if (!id) {
    return undefined;
  }

  return {
    id,
    name: asString(provider.name) ?? id,
    settings: isRecord(provider.settings) ? provider.settings : undefined,
  };
}

/** Normalize provider list results across supported OpenCode API shapes. */
function normalizeProviderList(value: unknown): ExistingProvider[] {
  const entries: readonly unknown[] = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.data)
      ? value.data
      : [];

  return entries
    .map(toExistingProvider)
    .filter((provider): provider is ExistingProvider => provider !== undefined);
}

/** Extract the ids of providers visible to a synchronous editor transform. */
function providerIDsFromRecords(records: readonly unknown[]): Set<string> {
  return new Set(normalizeProviderList(records).map((provider) => provider.id));
}

/**
 * Build a secret-free fingerprint of the captured provider inventory. Used to
 * decide whether a provider reload is required; model-only changes are handled
 * by the model transform instead.
 */
function providerFingerprint(providers: readonly CapturedProvider[]): string {
  return providers
    .map((provider) => {
      const settings = provider.info.settings as Record<string, unknown> | undefined;
      const baseURL = asString(settings?.baseURL) ?? "";
      const modelIDs = provider.models
        .map((model) => String(model.id))
        .sort()
        .join(",");
      return [
        provider.key,
        provider.info.name,
        provider.info.package,
        provider.info.activation,
        baseURL,
        modelIDs,
      ].join(":");
    })
    .sort()
    .join("|");
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
 * provider, injects them through provider and model transforms, and refreshes
 * captured inventories as config providers and model lists change.
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

    const source: { providers: CapturedProvider[] } = { providers: [] };
    let disposed = false;
    let refreshRunning = false;
    let refreshPending = false;
    let refreshTask: Promise<void> | undefined;
    /** Discover and map models for the given resolved targets. */
    const discoverTargets = async (
      resolvedTargets: readonly ProviderTarget[],
    ): Promise<CapturedProvider[]> => {
      const results = await Promise.all(
        resolvedTargets.map(async (target): Promise<CapturedProvider> => {
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

    /** Re-list providers, rediscover models, and replay the transforms. */
    const refresh = async (): Promise<void> => {
      let existing: ExistingProvider[] = [];
      try {
        const listed: unknown = await ctx.provider.list();
        existing = normalizeProviderList(listed);
      } catch {
        log(
          "warn",
          "[9router-provider] Unable to list existing providers; using options/defaults",
        );
      }

      const resolvedTargets = resolveTargets(existing, ctx.options);
      const nextProviders = await discoverTargets(resolvedTargets);
      if (disposed) {
        return;
      }

      const providerSetChanged =
        providerFingerprint(source.providers) !== providerFingerprint(nextProviders);

      source.providers = nextProviders;
      if (providerSetChanged) {
        await ctx.provider.reload();
      }
      await ctx.model.reload();
    };

    /** Coalesce refresh requests so only one discovery runs at a time. */
    const scheduleRefresh = (): void => {
      if (disposed) {
        return;
      }
      refreshPending = true;
      if (refreshRunning) {
        return;
      }

      refreshRunning = true;
      refreshTask = (async () => {
        try {
          while (refreshPending && !disposed) {
            refreshPending = false;
            await refresh();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await log("error", `[9router-provider] Refresh failed: ${message}`);
        }
      })().finally(() => {
        refreshRunning = false;
        refreshTask = undefined;
        if (refreshPending && !disposed) {
          scheduleRefresh();
        }
      });
    };

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

    await ctx.model.transform((editor) => {
      const availableProviderIDs = providerIDsFromRecords(editor.provider.list());
      for (const provider of source.providers) {
        if (!availableProviderIDs.has(provider.key)) {
          continue;
        }
        for (const model of provider.models) {
          editor.update(provider.key, model.id, (draft) => {
            Object.assign(draft, model);
          });
        }
      }
    });

    const eventAbort = new AbortController();
    const eventTask = (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: eventAbort.signal })) {
          if (event.type === "provider.updated") {
            scheduleRefresh();
          }
        }
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : String(error);
          await log("warn", `[9router-provider] Event subscription failed: ${message}`);
        }
      }
    })();

    const retryTimers = CONFIG_PROVIDER_RETRY_DELAYS.map((delay) =>
      setTimeout(scheduleRefresh, delay),
    );
    const timer = setInterval(scheduleRefresh, REFRESH_INTERVAL);

    return async () => {
      disposed = true;
      for (const retryTimer of retryTimers) {
        clearTimeout(retryTimer);
      }
      clearInterval(timer);
      eventAbort.abort();
      await eventTask;
      await refreshTask;
    };
  },
});
