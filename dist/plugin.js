import { DEFAULT_API_PATH, DEFAULT_BASE_URL, KNOWN_PROVIDER_PREFIXES, MAX_CONCURRENT_INFO, MODEL_INFO_TIMEOUT, MODELS_DEV_CACHE_TTL, MODELS_DEV_URL, PLUGIN_NAME, PROVIDER_DISPLAY_NAME, } from "./constants.js";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
// ── Utility Functions ──────────────────────────────────────
function formatModelName(modelId) {
    for (const [prefix, provider] of Object.entries(KNOWN_PROVIDER_PREFIXES)) {
        if (modelId.startsWith(prefix)) {
            return `${modelId.slice(prefix.length)} (${provider})`;
        }
    }
    return modelId;
}
function normalizeBaseURL(url) {
    return url.replace(/\/+$/, "");
}
function ensureAPIPath(baseURL) {
    return baseURL.endsWith(DEFAULT_API_PATH) ? baseURL : `${baseURL}${DEFAULT_API_PATH}`;
}
// ── Capability Resolution ──────────────────────────────────
async function fetchModelInfo(apiURL, modelId, apiKey) {
    try {
        const headers = {};
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }
        const response = await fetch(`${apiURL}/models/info?id=${encodeURIComponent(modelId)}`, {
            signal: AbortSignal.timeout(MODEL_INFO_TIMEOUT),
            headers,
        });
        if (!response.ok)
            return null;
        return (await response.json());
    }
    catch {
        return null;
    }
}
function mapRouterCapabilities(info) {
    const config = {};
    const inputModalities = new Set(["text"]);
    if (info.capabilities) {
        if (info.capabilities.vision) {
            config.attachment = true;
            inputModalities.add("image");
        }
        if (info.capabilities.tools) {
            config.tool_call = true;
        }
        if (info.capabilities.reasoning) {
            config.reasoning = true;
        }
        if (info.capabilities.audioInput) {
            inputModalities.add("audio");
        }
    }
    if (inputModalities.size > 1) {
        config.modalities = { input: Array.from(inputModalities), output: ["text"] };
    }
    return config;
}
async function fetchModelsDevCatalog() {
    const cacheDir = `${process.env.HOME}/.cache/opencode-9router`;
    const cacheFile = `${cacheDir}/models-dev.json`;
    const url = process.env.OPENCODE_MODELS_URL || MODELS_DEV_URL;
    // Try cache (respect TTL via file mtime)
    try {
        if (existsSync(cacheFile)) {
            const stat = statSync(cacheFile);
            if (Date.now() - stat.mtimeMs < MODELS_DEV_CACHE_TTL) {
                const content = readFileSync(cacheFile, "utf-8");
                return JSON.parse(content);
            }
        }
    }
    catch {
        // Cache miss or invalid — continue to fetch
    }
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok)
            return null;
        const data = (await response.json());
        // Best-effort cache write
        try {
            mkdirSync(cacheDir, { recursive: true });
            writeFileSync(cacheFile, JSON.stringify(data), "utf-8");
        }
        catch {
            // Cache write is optional
        }
        return data;
    }
    catch {
        return null;
    }
}
function findModelsDevMatch(modelId, catalog) {
    // Known prefixes to strip from model IDs before matching
    const stripPrefixes = [
        ...Object.keys(KNOWN_PROVIDER_PREFIXES),
        "nvidia/",
        "cmc/",
        "azure/",
        "aws/",
        "gcp/",
    ];
    let stripped = modelId;
    for (const prefix of stripPrefixes) {
        if (modelId.startsWith(prefix)) {
            stripped = modelId.slice(prefix.length);
            break;
        }
    }
    const normalized = stripped.toLowerCase().replace(/\./g, "-");
    let bestMatch = null;
    for (const entry of catalog) {
        const catalogId = typeof entry.id === "string"
            ? entry.id.toLowerCase().replace(/\./g, "-")
            : "";
        if (catalogId.endsWith(normalized)) {
            bestMatch = entry;
            break;
        }
        if (catalogId.includes(normalized) && !bestMatch) {
            bestMatch = entry;
        }
    }
    if (bestMatch) {
        return {
            id: bestMatch.id,
            capabilities: bestMatch.capabilities,
        };
    }
    return null;
}
async function resolveCapabilitiesBatch(modelIds, apiURL, apiKey) {
    // Start catalog fetch in parallel with per-model requests
    const catalogPromise = fetchModelsDevCatalog();
    const capabilities = {};
    // Try per-model API in batches of MAX_CONCURRENT_INFO
    for (let i = 0; i < modelIds.length; i += MAX_CONCURRENT_INFO) {
        const batch = modelIds.slice(i, i + MAX_CONCURRENT_INFO);
        const results = await Promise.allSettled(batch.map((id) => fetchModelInfo(apiURL, id, apiKey)));
        for (let j = 0; j < batch.length; j++) {
            const result = results[j];
            if (result.status === "fulfilled" && result.value) {
                capabilities[batch[j]] = mapRouterCapabilities(result.value);
            }
        }
    }
    // Fallback: models.dev catalog for models without API capabilities
    const catalog = await catalogPromise;
    if (catalog) {
        for (const modelId of modelIds) {
            if (!capabilities[modelId]) {
                const match = findModelsDevMatch(modelId, catalog);
                if (match) {
                    capabilities[modelId] = mapRouterCapabilities(match);
                }
            }
        }
    }
    return capabilities;
}
// ── Model Discovery ─────────────────────────────────────────
async function discoverModels(baseURL, apiKey) {
    const apiURL = ensureAPIPath(baseURL);
    try {
        const headers = {};
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }
        const response = await fetch(`${apiURL}/models`, {
            signal: AbortSignal.timeout(3000),
            headers,
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
            return null;
        }
        const models = {};
        const modelIds = [];
        for (const model of data.data) {
            models[model.id] = { name: formatModelName(model.id) };
            modelIds.push(model.id);
        }
        // Enrich with capabilities from per-model API and/or models.dev catalog
        const capabilities = await resolveCapabilitiesBatch(modelIds, apiURL, apiKey);
        for (const [id, caps] of Object.entries(capabilities)) {
            if (models[id]) {
                Object.assign(models[id], caps);
            }
        }
        // Default: tool_call is true for API-discovered models (like opencode does)
        for (const config of Object.values(models)) {
            config.tool_call = config.tool_call ?? true;
        }
        return models;
    }
    catch {
        return null;
    }
}
// ── Plugin ──────────────────────────────────────────────────
export const NineRouterPlugin = async ({ client }) => {
    const log = async (level, message) => {
        try {
            await client.app.log({
                body: {
                    service: "9router-provider",
                    level,
                    message,
                },
            });
        }
        catch {
            // Logging is best-effort
        }
    };
    return {
        config: async (config) => {
            config.provider ??= {};
            const provider = config.provider;
            // Collect all existing providers whose key starts with "9router"
            const providerKeys = Object.keys(provider).filter((k) => k.startsWith("9router"));
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
            const results = await Promise.allSettled(providerKeys.map(async (key) => {
                const existing = provider[key];
                const options = existing?.options;
                const baseURL = options?.baseURL ?? DEFAULT_BASE_URL;
                const apiKey = options?.apiKey;
                const existingName = existing?.name;
                const normalizedURL = normalizeBaseURL(baseURL);
                const apiURL = ensureAPIPath(normalizedURL);
                const discovered = await discoverModels(normalizedURL, apiKey);
                provider[key] = {
                    npm: existing?.npm ?? "@ai-sdk/openai-compatible",
                    name: existingName ?? key,
                    options: {
                        ...existing?.options,
                        baseURL: apiURL,
                    },
                    models: discovered ?? {},
                };
                return { key, discovered, apiURL };
            }));
            // Log results
            for (const result of results) {
                if (result.status === "fulfilled") {
                    const { key, discovered, apiURL } = result.value;
                    if (discovered) {
                        await log("info", `[${key}] Discovered ${Object.keys(discovered).length} models from ${apiURL}`);
                    }
                    else {
                        await log("warn", `[${key}] Failed to discover models from ${apiURL}. Check if the service is running and accessible.`);
                    }
                }
                else {
                    await log("error", `Provider pipeline error: ${result.reason}`);
                }
            }
        },
    };
};
