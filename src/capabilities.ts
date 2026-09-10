import type { ModelConfig, ModelsDevEntry, RouterModelInfo } from "./types.js";
import {
  COMBO_CONTEXT_WINDOW,
  COMBO_MAX_OUTPUT,
  COMBO_OWNER,
  COMBO_REASONING_EFFORTS,
  KNOWN_PROVIDER_PREFIXES,
  MAX_CONCURRENT_INFO,
  MODEL_INFO_TIMEOUT,
} from "./constants.js";
import { fetchModelsDevCatalog } from "./cache.js";
import { toPositiveInt } from "./utils.js";

// ── Capability Resolution ──────────────────────────────────

/**
 * Detect whether a model is a 9Router virtual combo. The authoritative signal
 * is `owned_by === "combo"`; when `owned_by` is absent (legacy responses) fall
 * back to the prefix heuristic where combo IDs carry no provider prefix.
 */
export function isComboModel(modelId: string, ownedBy?: string): boolean {
  if (ownedBy !== undefined) {
    return ownedBy === COMBO_OWNER;
  }
  return !modelId.includes("/");
}

/**
 * Capability fragment forced onto combo models that resolved no information
 * from the models.dev catalog or the per-model API. Assumes multimodal input
 * (text/image/audio), tool calling, and reasoning, and exposes thinking-level
 * variants explicitly so they survive OpenCode's id-based exclusions.
 */
export function forceComboConfig(): Partial<ModelConfig> {
  return {
    attachment: true,
    tool_call: true,
    reasoning: true,
    modalities: { input: ["text", "image", "audio"], output: ["text"] },
    limit: { context: COMBO_CONTEXT_WINDOW, output: COMBO_MAX_OUTPUT },
    variants: Object.fromEntries(
      COMBO_REASONING_EFFORTS.map((effort) => [effort, { reasoningEffort: effort }]),
    ),
    search: false,
    context_length: COMBO_CONTEXT_WINDOW,
    max_completion_tokens: COMBO_MAX_OUTPUT,
  };
}

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

/** Normalize a model ID for catalog comparison: strip a known provider
 * prefix, lowercase, and canonicalize dots to dashes. */
function normalizeModelId(modelId: string): string {
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

  return stripped.toLowerCase().replace(/\./g, "-");
}

/** Last path segment of a catalog ID, normalized for comparison. */
function catalogLastSegment(catalogId: string): string {
  const parts = catalogId.toLowerCase().replace(/\./g, "-").split("/");
  return parts[parts.length - 1] ?? "";
}

/** Project a models.dev entry onto the RouterModelInfo shape. */
function toRouterModelInfo(entry: ModelsDevEntry): RouterModelInfo {
  const inputModalities = entry.modalities?.input ?? [];
  return {
    id: entry.id,
    capabilities: {
      vision: entry.attachment ?? inputModalities.includes("image"),
      tools: entry.tool_call ?? false,
      reasoning: entry.reasoning ?? false,
      audioInput: inputModalities.includes("audio"),
      // models.dev exposes token limits at the entry's top level as
      // limit.context / limit.output. Mirror them onto the capabilities
      // fields mapRouterCapabilities reads so they reach config.limit
      // through the single validated path (toPositiveInt).
      contextWindow: entry.limit?.context,
      maxOutput: entry.limit?.output,
    },
  };
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
  const normalized = normalizeModelId(modelId);

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

  return bestMatch ? toRouterModelInfo(bestMatch) : null;
}

/**
 * Find a models.dev catalog entry whose final path segment exactly equals the
 * normalized model ID. Stricter than {@link findModelsDevMatch}: a loose
 * substring hit (e.g. `vision` → `gpt-4-turbo-vision`) is rejected, so combo
 * models are only treated as enriched when the catalog truly knows them.
 */
export function findModelsDevMatchExact(
  modelId: string,
  catalog: ModelsDevEntry[],
): RouterModelInfo | null {
  const normalized = normalizeModelId(modelId);
  for (const entry of catalog) {
    if (typeof entry.id === "string" && catalogLastSegment(entry.id) === normalized) {
      return toRouterModelInfo(entry);
    }
  }
  return null;
}

/**
 * Whether a `/models/info` response carries a meaningful capability signal.
 * A bare `tools: true` (the default stub returned by some 9Router backends) is
 * NOT a signal; vision, reasoning, audio input, or a positive token limit are.
 */
export function isRealRouterSignal(info: RouterModelInfo): boolean {
  const capabilities = info.capabilities;
  if (capabilities?.vision || capabilities?.reasoning || capabilities?.audioInput) {
    return true;
  }
  return toPositiveInt(capabilities?.contextWindow ?? info.context_length) !== undefined;
}

const CAPABILITY_BUDGET_MS = 10000;

/**
 * Resolve capabilities for a batch of model IDs using the models.dev catalog
 * first, then falling back to per-model API queries within a time budget.
 *
 * Combo IDs (see {@link isComboModel}) are held to a stricter bar: they only
 * count as resolved on an exact models.dev match or a meaningful API signal,
 * so backends that return a capability stub for combos do not suppress the
 * forced multimodal defaults.
 */
export async function resolveCapabilitiesBatch(
  modelIds: string[],
  apiURL: string,
  apiKey?: string,
  comboIds?: ReadonlySet<string>,
): Promise<Record<string, Partial<ModelConfig>>> {
  const capabilities: Record<string, Partial<ModelConfig>> = {};

  // 1. Fetch models.dev catalog first (cached 1h → near-instant most runs)
  const catalog = await fetchModelsDevCatalog();

  // 2. Resolve from catalog, queue remainder for API
  const pendingIds: string[] = [];
  for (const id of modelIds) {
    const isCombo = comboIds?.has(id) ?? false;
    let resolved = false;
    if (catalog) {
      const match = isCombo
        ? findModelsDevMatchExact(id, catalog)
        : findModelsDevMatch(id, catalog);
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
        const id = batch[j];
        if (comboIds?.has(id) && !isRealRouterSignal(result.value)) {
          continue;
        }
        capabilities[id] = mapRouterCapabilities(result.value);
      }
    }
  }

  return capabilities;
}
