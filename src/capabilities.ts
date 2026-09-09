import type { ModelConfig, ModelsDevEntry, RouterModelInfo } from "./types.js";
import { KNOWN_PROVIDER_PREFIXES, MAX_CONCURRENT_INFO, MODEL_INFO_TIMEOUT } from "./constants.js";
import { fetchModelsDevCatalog } from "./cache.js";
import { toPositiveInt } from "./utils.js";

// ── Capability Resolution ──────────────────────────────────

/**
 * Query the per-model `/models/info` endpoint of a 9Router-compatible API.
 * Retries once with exponential backoff on transient failures.
 */
async function fetchModelInfo(
  apiURL: string,
  modelId: string,
  apiKey?: string,
  retries = 1,
): Promise<RouterModelInfo | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      const response = await fetch(
        `${apiURL}/models/info?id=${encodeURIComponent(modelId)}`,
        {
          signal: AbortSignal.timeout(MODEL_INFO_TIMEOUT),
          headers,
        },
      );
      if (!response.ok) return null;
      return (await response.json()) as RouterModelInfo;
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  return null;
}

/**
 * Map 9Router model info into an OpenCode model config fragment.
 * Only present capabilities are copied; limit fields are validated as
 * positive integers before being assigned.
 */
export function mapRouterCapabilities(info: RouterModelInfo): Partial<ModelConfig> {
  const config: Partial<ModelConfig> = {};
  const inputModalities: Set<"text" | "audio" | "image" | "video" | "pdf"> = new Set(["text"]);

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

  // Context window / max output limits. OpenCode's context-usage percentage
  // is computed from `limit.context`; without it, the UI always shows 0%
  // used. 9Router exposes these both nested under `capabilities` and as
  // top-level `context_length` / `max_completion_tokens` fields.
  const contextWindow = info.capabilities?.contextWindow ?? info.context_length;
  const context = toPositiveInt(contextWindow);
  if (context !== undefined) {
    const maxOutput = info.capabilities?.maxOutput ?? info.max_completion_tokens;
    const output = toPositiveInt(maxOutput);
    config.limit = output !== undefined ? { context, output } : { context };
  }

  return config;
}

/**
 * Find the best models.dev catalog entry for a model ID, matching by suffix
 * (preferred) or substring after stripping known provider prefixes.
 * Returns null when nothing matches.
 */
export function findModelsDevMatch(
  modelId: string,
  catalog: ModelsDevEntry[],
): RouterModelInfo | null {
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

  let bestMatch: ModelsDevEntry | null = null;

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
    const inputModalities = bestMatch.modalities?.input ?? [];
    return {
      id: bestMatch.id,
      capabilities: {
        vision: bestMatch.attachment ?? inputModalities.includes("image"),
        tools: bestMatch.tool_call ?? false,
        reasoning: bestMatch.reasoning ?? false,
        audioInput: inputModalities.includes("audio"),
        // models.dev exposes token limits at the entry's top level as
        // limit.context / limit.output. Mirror them onto the capabilities
        // fields mapRouterCapabilities reads so they reach config.limit
        // through the single validated path (toPositiveInt).
        contextWindow: bestMatch.limit?.context,
        maxOutput: bestMatch.limit?.output,
      },
    };
  }

  return null;
}

const CAPABILITY_BUDGET_MS = 10000;

/**
 * Resolve capabilities for a batch of model IDs using the models.dev catalog
 * first, then falling back to per-model API queries within a time budget.
 */
export async function resolveCapabilitiesBatch(
  modelIds: string[],
  apiURL: string,
  apiKey?: string,
): Promise<Record<string, Partial<ModelConfig>>> {
  const capabilities: Record<string, Partial<ModelConfig>> = {};

  // 1. Fetch models.dev catalog first (cached 1h → near-instant most runs)
  const catalog = await fetchModelsDevCatalog();

  // 2. Resolve from catalog, queue remainder for API
  const pendingIds: string[] = [];
  for (const id of modelIds) {
    let resolved = false;
    if (catalog) {
      const match = findModelsDevMatch(id, catalog);
      if (match?.capabilities) {
        capabilities[id] = mapRouterCapabilities(match);
        resolved = true;
      }
    }
    if (!resolved) {
      pendingIds.push(id);
    }
  }

  // 3. Only hit per-model API for models not in catalog, with time budget
  if (pendingIds.length === 0) return capabilities;

  const startTime = Date.now();
  for (let i = 0; i < pendingIds.length; i += MAX_CONCURRENT_INFO) {
    if (Date.now() - startTime > CAPABILITY_BUDGET_MS) {
      // Budget exhausted — give up on remaining models, fallback will serve them
      break;
    }
    const batch = pendingIds.slice(i, i + MAX_CONCURRENT_INFO);
    const results = await Promise.allSettled(
      batch.map((id) => fetchModelInfo(apiURL, id, apiKey)),
    );
    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value) {
        capabilities[batch[j]] = mapRouterCapabilities(result.value);
      }
    }
  }

  return capabilities;
}
