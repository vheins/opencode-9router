import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import {
  PLUGIN_NAME,
  PROVIDER_DISPLAY_NAME,
  DEFAULT_BASE_URL,
  DEFAULT_API_PATH,
  KNOWN_PROVIDER_PREFIXES,
} from "./constants.js";

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

async function discoverModels(
  baseURL: string,
  apiKey?: string,
): Promise<Record<string, { name: string }> | null> {
  const apiURL = ensureAPIPath(baseURL);
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${apiURL}/models`, {
      signal: AbortSignal.timeout(3000),
      headers,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      data?: Array<{ id: string }>;
    };
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      return null;
    }

    const models: Record<string, { name: string }> = {};
    for (const model of data.data) {
      models[model.id] = { name: formatModelName(model.id) };
    }
    return models;
  } catch {
    return null;
  }
}

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

          const discovered = await discoverModels(normalizedURL, apiKey);

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
