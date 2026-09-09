import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  DEFAULT_BASE_URL,
  DISCOVERY_CACHE_TTL,
  DISCOVERY_TIMEOUT,
  PLUGIN_NAME,
  PROVIDER_DISPLAY_NAME,
} from "./constants.js";
import { discoverModels } from "./discovery.js";
import { ensureAPIPath, normalizeBaseURL } from "./utils.js";

// ── Plugin Entry ────────────────────────────────────────────

/**
 * OpenCode plugin provider for 9Router. Registers a "9router" provider and,
 * in the config hook, auto-discovers models (enriched with capabilities and
 * token limits) for every configured 9router-family provider.
 */
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
