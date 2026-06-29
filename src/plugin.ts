import type { Hooks, Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import {
  PLUGIN_NAME,
  PROVIDER_DISPLAY_NAME,
  DEFAULT_BASE_URL,
  DEFAULT_API_PATH,
  KNOWN_PROVIDER_PREFIXES,
} from "./constants.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

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

function resolveBaseURL(options?: PluginOptions): { url: string; isDefault: boolean } {
  if (options?.baseURL && typeof options.baseURL === "string") {
    return { url: normalizeBaseURL(options.baseURL), isDefault: false };
  }
  const envURL = (globalThis as Record<string, unknown>).process as
    | { env?: Record<string, string> }
    | undefined;
  if (envURL?.env?.ROUTER_BASE_URL) {
    return { url: normalizeBaseURL(envURL.env.ROUTER_BASE_URL), isDefault: false };
  }
  return { url: DEFAULT_BASE_URL, isDefault: true };
}

function ensureAPIPath(baseURL: string): string {
  return baseURL.endsWith(DEFAULT_API_PATH) ? baseURL : `${baseURL}${DEFAULT_API_PATH}`;
}

async function getAuthBaseURL(): Promise<string | null> {
  try {
    const authPath = path.join(os.homedir(), ".local", "share", "opencode", "auth.json");
    const authContent = await fs.promises.readFile(authPath, "utf-8");
    const auth = JSON.parse(authContent) as Record<string, any>;
    
    // Find 9Router auth entry
    for (const key of Object.keys(auth)) {
      if (key.toLowerCase().includes("9router")) {
        const entry = auth[key];
        if (entry?.baseURL && typeof entry.baseURL === "string") {
          return normalizeBaseURL(entry.baseURL);
        }
      }
    }
  } catch {
    // Auth file doesn't exist or can't be read
  }
  return null;
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
  const { url: configuredBaseURL, isDefault } = resolveBaseURL(options);

  // Try to get baseURL from auth file (set via opencode auth login)
  const authBaseURL = await getAuthBaseURL();
  const effectiveBaseURL = authBaseURL ?? configuredBaseURL;

  // Always try to discover models from effective baseURL
  const discovered = await discoverModels(effectiveBaseURL);

  if (!discovered && client?.app?.log) {
    const level = authBaseURL ? "error" : "info";
    const message = authBaseURL
      ? `9Router not reachable at ${effectiveBaseURL}. Please check if 9Router is running and accessible.`
      : `9Router baseURL not configured. Set it via plugin options, ROUTER_BASE_URL env var, or 'opencode auth login' to auto-discover models.`;
    
    await client.app.log({
      body: {
        service: "9router-provider",
        level,
        message,
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
          baseURL: ensureAPIPath(effectiveBaseURL),
        },
        models: discovered ?? {},
      };
    },
    auth: {
      provider: PLUGIN_NAME,
      async loader(getAuth) {
        const auth = await getAuth();
        if (auth && typeof auth === "object" && "baseURL" in auth) {
          const userURL = normalizeBaseURL(String(auth.baseURL));
          const apiURL = ensureAPIPath(userURL);
          
          // Re-discover models with user-provided baseURL
          const authDiscovered = await discoverModels(userURL);
          if (authDiscovered) {
            if (client?.app?.log) {
              await client.app.log({
                body: {
                  service: "9router-provider",
                  level: "info",
                  message: `Discovered ${Object.keys(authDiscovered).length} models from ${apiURL}`,
                },
              });
            }
          } else if (client?.app?.log) {
            await client.app.log({
              body: {
                service: "9router-provider",
                level: "error",
                message: `Failed to discover models from ${apiURL}. Check if 9Router is running and accessible.`,
              },
            });
          }
          
          return { baseURL: apiURL };
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
          ],
        },
      ],
    },
  } satisfies Hooks;
};
