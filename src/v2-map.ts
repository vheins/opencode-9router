import { Model, Provider } from "@opencode/plugin";
import type { ModelConfig } from "./types.js";

// ── V1 ModelConfig → V2 Model.Info Mapping ──────────────────

/** Fallback context window when a discovered model reports no limit. */
export const DEFAULT_CONTEXT_LIMIT = 200000;

/** Fallback max output tokens when a discovered model reports no limit. */
export const DEFAULT_OUTPUT_LIMIT = 32000;

/**
 * Build the V2 capability input modality list from a V1 config. `text` is
 * always present (V2 requires it); `attachment` implies image input; any
 * explicit modalities from discovery are carried through verbatim.
 */
function mapInputModalities(config: ModelConfig): string[] {
  const modalities = new Set<string>(config.modalities?.input ?? []);
  modalities.add("text");
  if (config.attachment) {
    modalities.add("image");
  }
  return Array.from(modalities);
}

/**
 * Build the V2 capability output modality list from a V1 config. Defaults to
 * `["text"]` and guarantees `text` is present.
 */
function mapOutputModalities(config: ModelConfig): string[] {
  const modalities = new Set<string>(config.modalities?.output ?? []);
  modalities.add("text");
  return Array.from(modalities);
}

/**
 * Map the V1 `variants` record (`{ low: { reasoningEffort: "low" } }`) into the
 * V2 array shape (`[{ id, settings }]`). Returns an empty array when absent.
 */
function mapVariants(config: ModelConfig): Model.Info["variants"] {
  if (!config.variants) {
    return [];
  }
  return Object.entries(config.variants).map(([id, settings]) => ({
    id: Model.VariantID.make(id),
    settings: settings as Model.Settings,
  }));
}

/**
 * Map a single discovered V1 `ModelConfig` fragment onto a V2 `Model.Info`,
 * based on `Model.Info.default(providerID, modelID)` and overriding the fields
 * 9Router discovery enriches. V2 requires both `limit.context` and
 * `limit.output` as numbers, so fallbacks are applied when discovery omitted
 * them.
 */
export function toModelInfo(
  providerID: string,
  modelID: string,
  config: ModelConfig,
): Model.Info {
  const base = Model.Info.default(
    Provider.ID.make(providerID),
    Model.ID.make(modelID),
  );

  const info: Model.Info = {
    ...base,
    name: config.name,
    capabilities: {
      tools: config.tool_call ?? true,
      input: mapInputModalities(config),
      output: mapOutputModalities(config),
    },
    limit: {
      context: config.limit?.context ?? DEFAULT_CONTEXT_LIMIT,
      output: config.limit?.output ?? DEFAULT_OUTPUT_LIMIT,
    },
    variants: mapVariants(config),
    enabled: true,
    status: "active",
  };

  return info;
}

/**
 * Map a full discovery result (`Record<string, ModelConfig>`) onto a list of V2
 * `Model.Info` values, preserving key order.
 */
export function toModelInfos(
  providerID: string,
  models: Record<string, ModelConfig>,
): Model.Info[] {
  return Object.entries(models).map(([id, config]) =>
    toModelInfo(providerID, id, config),
  );
}
