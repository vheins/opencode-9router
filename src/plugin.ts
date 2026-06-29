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
): Promise<Record<string, { name: string }> | null> {
  const apiURL = ensureAPIPath(baseURL);
  try {
    const response = await fetch(`${apiURL}/models`, {
      signal: AbortSignal.timeout(3000),
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
      if (!config.provider) {
        await log("info", "9Router provider not configured. Add it to opencode.json provider section.");
        return;
      }

      const existingProvider = config.provider[PLUGIN_NAME];
      if (!existingProvider) {
        await log("info", "9Router provider not configured. Add it to opencode.json provider section.");
        return;
      }

      const options = existingProvider.options as Record<string, unknown> | undefined;
      const baseURL = options?.baseURL as string | undefined;
      if (!baseURL) {
        await log("warn", "9Router provider missing baseURL option.");
        return;
      }

      const normalizedURL = normalizeBaseURL(baseURL);
      const apiURL = ensureAPIPath(normalizedURL);

      const discovered = await discoverModels(normalizedURL);
      if (discovered) {
        config.provider[PLUGIN_NAME] = {
          ...existingProvider,
          options: { ...options, baseURL: apiURL },
          models: discovered,
        };
        await log("info", `Discovered ${Object.keys(discovered).length} models from ${apiURL}`);
      } else {
        await log("error", `Failed to discover models from ${apiURL}. Check if 9Router is running and accessible.`);
      }
    },
  } satisfies Hooks;
};
