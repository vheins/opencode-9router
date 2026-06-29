import type { Hooks, Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import {
  PLUGIN_NAME,
  PROVIDER_DISPLAY_NAME,
  DEFAULT_BASE_URL,
  DEFAULT_API_PATH,
  FALLBACK_MODELS,
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

function resolveBaseURL(options?: PluginOptions): string {
  if (options?.baseURL && typeof options.baseURL === "string") {
    return normalizeBaseURL(options.baseURL);
  }
  const envURL = (globalThis as Record<string, unknown>).process as 
    | { env?: Record<string, string> }
    | undefined;
  if (envURL?.env?.ROUTER_BASE_URL) {
    return normalizeBaseURL(envURL.env.ROUTER_BASE_URL);
  }
  return DEFAULT_BASE_URL;
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

export const NineRouterPlugin: Plugin = async (
  { client }: PluginInput,
  options?: PluginOptions,
) => {
  const configuredBaseURL = resolveBaseURL(options);

  const discovered = await discoverModels(configuredBaseURL);
  const models = discovered ?? FALLBACK_MODELS;

  if (!discovered && client?.app?.log) {
    await client.app.log({
      body: {
        service: "9router-provider",
        level: "warn",
        message: `9Router not reachable at ${configuredBaseURL}. Using well-known model list. Start 9Router and restart opencode to auto-discover models.`,
      },
    });
  }

  return {
    config: async (config) => {
      config.provider ??= {};
      config.provider[PLUGIN_NAME] = {
        npm: "@ai-sdk/openai-compatible",
        name: PROVIDER_DISPLAY_NAME,
        options: {
          baseURL: ensureAPIPath(configuredBaseURL),
        },
        models,
      };
    },
    auth: {
      provider: PLUGIN_NAME,
      async loader(getAuth) {
        const auth = await getAuth();
        if (auth && typeof auth === "object" && "baseURL" in auth) {
          const userURL = normalizeBaseURL(String(auth.baseURL));
          return { baseURL: ensureAPIPath(userURL) };
        }
        return {};
      },
      methods: [
        {
          label: `Connect to ${PROVIDER_DISPLAY_NAME}`,
          type: "api" as const,
          prompts: [
            {
              type: "text" as const,
              message: `${PROVIDER_DISPLAY_NAME} Base URL (default: ${DEFAULT_BASE_URL})`,
              key: "baseURL",
            },
            {
              type: "text" as const,
              message: `${PROVIDER_DISPLAY_NAME} API Key (from Dashboard → Endpoints)`,
              key: "apiKey",
            },
          ],
        },
      ],
    },
  } satisfies Hooks;
};
