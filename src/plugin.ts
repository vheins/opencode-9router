import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
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

async function discoverModels(
  baseURL: string,
): Promise<Record<string, { name: string }> | null> {
  const apiURL = `${baseURL}${DEFAULT_API_PATH}`;
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
  const configuredBaseURL = DEFAULT_BASE_URL;

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
    provider: {
      [PLUGIN_NAME]: {
        npm: "@ai-sdk/openai-compatible",
        name: PROVIDER_DISPLAY_NAME,
        options: {
          baseURL: `${configuredBaseURL}${DEFAULT_API_PATH}`,
        },
        models,
      },
    },
    auth: {
      provider: PLUGIN_NAME,
      async loader(getAuth: () => Promise<Record<string, unknown>>) {
        const auth = await getAuth();
        if (auth && typeof auth === "object" && "baseURL" in auth) {
          return { baseURL: `${String(auth.baseURL)}${DEFAULT_API_PATH}` };
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
              default: DEFAULT_BASE_URL,
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
  } as unknown as Hooks;
};
