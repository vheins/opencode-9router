import type { ModelsDevEntry, ReasoningOption } from "./types.js";

// Only route aliases for the same provider. Subscription/custom routes stay unknown.
const CATALOG_PROVIDERS: Record<string, string> = {
  glm: "zai",
  "glm-cn": "zhipuai",
  zhipu: "zhipuai",
  gemini: "google",
  kimi: "moonshotai",
  "kimi-cn": "moonshotai-cn",
  qwen: "alibaba",
  "qwen-cn": "alibaba-cn",
  github: "github-copilot",
  gh: "github-copilot",
  claude: "anthropic",
  doubao: "volcengine",
  "cloudflare-ai": "cloudflare-workers-ai",
};

const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

/** Executable controls require exact provider + full model ID, never fuzzy matches. */
export function findReasoningOptions(modelId: string, catalog: ModelsDevEntry[]): ReasoningOption[] | undefined {
  const slash = modelId.indexOf("/");
  if (slash < 1) return undefined;
  const route = modelId.slice(0, slash);
  const provider = CATALOG_PROVIDERS[route] ?? route;
  const id = modelId.slice(slash + 1);
  const matches = catalog.filter((entry) => entry.catalogProvider === provider && entry.id === id);
  if (matches.length !== 1 || matches[0].reasoning !== true) return undefined;
  const raw = matches[0].reasoning_options;
  if (!Array.isArray(raw)) return undefined;
  const options: ReasoningOption[] = [];
  for (const option of raw) {
    if (!option || typeof option !== "object") continue;
    if (option.type === "effort" && Array.isArray(option.values)) {
      const values = [...new Set<string>(option.values.filter((value: unknown): value is string =>
        typeof value === "string" && EFFORTS.has(value)))];
      if (values.length) options.push({ type: "effort", values });
    } else if (option.type === "toggle") {
      options.push({ type: "toggle" });
    }
  }
  // ponytail: numeric budgets have no discrete modes; add only with a budget UI/contract.
  return options.length ? options : undefined;
}
