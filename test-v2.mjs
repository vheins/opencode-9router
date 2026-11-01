import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeProviderOptions as mergeOverlay } from "@opencode/ai";

const packageJson = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const require = createRequire(import.meta.url);

assert.equal(packageJson.exports["./server"].default, "./dist/index.js");
assert.ok(packageJson.files.includes("server.js"));

const localEntry = await import("./server.js");
assert.equal(localEntry.default.id, "9router");
assert.equal(typeof localEntry.default.setup, "function");
assert.equal(typeof localEntry.default.server, "function");
assert.equal(typeof localEntry.NineRouterPlugin, "function");

const packageEntry = await import("@vheins/opencode-9router/server");
assert.equal(packageEntry.default.id, "9router");
assert.equal(typeof packageEntry.default.setup, "function");
assert.equal(typeof packageEntry.default.server, "function");

assert.equal(require.resolve("@vheins/opencode-9router/server"), new URL("./dist/index.js", import.meta.url).pathname);

console.log("V2 entrypoint and package export checks passed");

// ── Late config-provider lifecycle ──────────────────────────
// The external plugin runs before OpenCode's internal ConfigProviderPlugin.
// Prove that models captured before config providers are visible still land on
// those providers once a `provider.updated` replay happens.

process.env.XDG_CACHE_HOME = await mkdtemp(join(tmpdir(), "opencode-9router-v2-"));
const { nineRouterV2 } = await import("./dist/v2.js");

const providerRecords = new Map();
const providerTransforms = [];
const modelTransforms = [];
let candidates = new Map();

const providerEditor = {
  list: () => Array.from(providerRecords.values()),
  get: (id) => providerRecords.get(id),
  add: ({ info, models }) => {
    providerRecords.set(info.id, {
      provider: info,
      models: new Map(models.map((model) => [model.id, structuredClone(model)])),
    });
  },
  update: (id, update) => {
    const record = providerRecords.get(id);
    if (record) {
      update(record.provider);
    }
  },
  remove: (id) => {
    providerRecords.delete(id);
  },
  models: {
    set: (id, models) => {
      const record = providerRecords.get(id);
      if (record) {
        record.models = new Map(models.map((model) => [model.id, structuredClone(model)]));
      }
    },
    update: (id, modelID, update) => {
      const record = providerRecords.get(id);
      const model = record?.models.get(modelID);
      if (model) {
        update(model);
      }
    },
    remove: (id, modelID) => {
      providerRecords.get(id)?.models.delete(modelID);
    },
  },
};

const modelEditor = {
  list: (providerID) =>
    Array.from(candidates.values()).flatMap((record) =>
      providerID && record.provider.id !== providerID
        ? []
        : Array.from(record.models.values()),
    ),
  get: (providerID, modelID) => candidates.get(providerID)?.models.get(modelID),
  update: (providerID, modelID, update) => {
    const record = candidates.get(providerID);
    if (!record) {
      return;
    }
    let model = record.models.get(modelID);
    if (!model) {
      model = {
        id: modelID,
        providerID,
        name: modelID,
        enabled: false,
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        limit: { context: 1, output: 1 },
        status: "active",
        variants: [],
      };
      record.models.set(modelID, model);
    }
    update(model);
  },
  remove: (providerID, modelID) => {
    candidates.get(providerID)?.models.delete(modelID);
  },
  default: {
    get: () => undefined,
    set: () => undefined,
  },
  provider: {
    list: () => Array.from(providerRecords.values()),
    get: (id) => providerRecords.get(id),
  },
};

// Model the relevant OpenCode 2.1.4 config overlay seam, not array replacement:
// 68bc26b7da1990ce10ffecfbc1e09eb13aa5d824, packages/core/src/config/plugin/provider.ts.
// This is a bounded host-semantics model, not execution of OpenCode core.
const configuredVariants = [
  { id: "high", settings: { reasoningEffort: "low" }, body: { custom_variant: true } },
  { id: "thinking", settings: { reasoningEffort: "high" } },
  { id: "custom", settings: { custom: true } },
];
const replayModelTransforms = () => {
  candidates = structuredClone(providerRecords);
  for (const transform of modelTransforms) transform(modelEditor);
  const configured = candidates.get("9router-inferhub")?.models.get("vendor/model-a");
  if (configured) {
    configured.settings = mergeOverlay(configured.settings, { custom: true });
    configured.body = mergeOverlay(configured.body, { custom_body: true });
    for (const variant of configuredVariants) {
      let existing = configured.variants.find((item) => item.id === variant.id);
      if (!existing) configured.variants.push(existing = { id: variant.id });
      for (const key of ["settings", "body"]) {
        if (variant[key] !== undefined) existing[key] = mergeOverlay(existing[key], variant[key]);
      }
    }
  }
};
const replayProviderTransforms = () => {
  for (const transform of providerTransforms) {
    transform(providerEditor);
  }
  replayModelTransforms();
};

let refreshEvent;
let effortValues = ["low", "high"];
let reloadAttempts = 0;
let reloadFailures = 0;
let refreshFailures = 0;
const originalError = console.error;
console.error = (...args) => {
  if (args.some((arg) => String(arg).includes("Refresh failed: synthetic reload failure"))) refreshFailures++;
  else originalError(...args);
};
const context = {
  options: { cache: false },
  provider: {
    list: async () => Array.from(providerRecords.values()),
    transform: async (callback) => {
      providerTransforms.push(callback);
      callback(providerEditor);
      return { dispose: () => undefined };
    },
    reload: async () => {
      reloadAttempts++;
      if (reloadFailures > 0) {
        reloadFailures--;
        throw new Error("synthetic reload failure");
      }
      replayProviderTransforms();
    },
  },
  model: {
    transform: async (callback) => {
      modelTransforms.push(callback);
      callback(modelEditor);
      return { dispose: () => undefined };
    },
    reload: async () => {
      replayModelTransforms();
    },
  },
  event: {
    subscribe: ({ signal } = {}) => ({
      async *[Symbol.asyncIterator]() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (!signal?.aborted) {
          yield { type: "provider.updated" };
        }
        while (!signal?.aborted) {
          const event = await new Promise((resolve) => {
            refreshEvent = resolve;
            signal?.addEventListener("abort", () => resolve(undefined), { once: true });
          });
          refreshEvent = undefined;
          if (!event) return;
          yield event;
        }
      },
    }),
  },
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("/models/info")) {
    return new Response(JSON.stringify({ id: "model", capabilities: { tools: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.includes("api.json") || url.includes("models.dev")) {
    return new Response(JSON.stringify({
      vendor: {
        models: {
          a: {
            id: "model-a",
            reasoning: true,
            reasoning_options: [{ type: "effort", values: effortValues }, { type: "toggle" }],
          },
        },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      data: [
        { id: "vendor/model-a", owned_by: "vendor" },
        { id: "vendor/model-b", owned_by: "vendor" },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), message);
}
async function requestRefresh() {
  await until(() => refreshEvent !== undefined, "refresh event subscriber ready");
  refreshEvent({ type: "provider.updated" });
}
let cleanup;
try {
  cleanup = await nineRouterV2.setup(context);
  await delay(10);

  // Simulate ConfigProviderPlugin registering a configured provider late.
  providerRecords.set("9router-inferhub", {
    provider: {
      id: "9router-inferhub",
      name: "Inferhub",
      activation: "enabled",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: "https://router.test", apiKey: "test" },
    },
    models: new Map(),
  });

  const deadline = Date.now() + 2000;
  while (
    Date.now() < deadline &&
    (providerRecords.get("9router-inferhub")?.models.size ?? 0) < 2
  ) {
    await delay(20);
  }

  assert.equal(
    providerRecords.get("9router-inferhub")?.models.size,
    2,
    "late config provider should receive discovered models",
  );
  assert.equal(modelTransforms.length, 0, "discovery must not overwrite configured model variants");
  replayProviderTransforms();
  const configured = candidates.get("9router-inferhub").models.get("vendor/model-a");
  assert.deepEqual(configured.variants, [
    { id: "low", settings: { reasoningEffort: "low" } },
    { id: "high", settings: { reasoningEffort: "low" }, body: { custom_variant: true } },
    { id: "none", settings: { reasoningEffort: null }, body: { enable_thinking: false } },
    { id: "thinking", settings: { reasoningEffort: "high" }, body: { enable_thinking: true } },
    { id: "custom", settings: { custom: true } },
  ], "host configuration merges by ID; same-ID effort override retains catalog toggle body");
  const saved = configuredVariants.splice(0);
  replayModelTransforms();
  assert.deepEqual(
    candidates.get("9router-inferhub").models.get("vendor/model-a").variants,
    providerRecords.get("9router-inferhub").models.get("vendor/model-a").variants,
    "empty host variants array leaves catalog variants intact",
  );
  configuredVariants.push(...saved);
  replayModelTransforms();
  const replayed = candidates.get("9router-inferhub").models.get("vendor/model-a");
  assert.deepEqual(replayed.settings, { custom: true });
  assert.deepEqual(replayed.body, { custom_body: true });
  assert.equal(
    providerRecords.get("9router-inferhub").models.get("vendor/model-a").settings,
    undefined,
    "source models remain unmodified by overrides",
  );
  const sourceModel = () => providerRecords.get("9router-inferhub").models.get("vendor/model-a");
  assert.deepEqual(sourceModel().variants.map((v) => v.id), ["low", "high", "none", "thinking"]);
  // Force changed controls, fail publication, then retry identical discovery.
  const { rm } = await import("node:fs/promises");
  await rm(join(process.env.XDG_CACHE_HOME, "opencode-9router", "models-dev.json"));
  effortValues = ["low", "high", "max"];
  reloadFailures = 1;
  const before = reloadAttempts;
  await requestRefresh();
  await until(() => refreshFailures === 1, "failed publication reported");
  assert.equal(reloadAttempts, before + 1);
  assert.equal(sourceModel().variants.some((v) => v.id === "max"), false, "failed reload did not publish controls");
  await requestRefresh();
  await until(() => sourceModel().variants.some((v) => v.id === "max"), "identical discovery retries failed publication");
  assert.equal(reloadAttempts, before + 2);
  assert.deepEqual(sourceModel().variants.map((v) => v.id), [...effortValues, "none", "thinking"]);
  const refreshed = candidates.get("9router-inferhub").models.get("vendor/model-a");
  assert.ok(refreshed.variants.some((v) => v.id === "max"), "provider replay refreshes modeled candidates");
  assert.equal(refreshed.variants.find((v) => v.id === "high").settings.reasoningEffort, "low", "configured override survives refresh");
  assert.deepEqual(refreshed.variants.find((v) => v.id === "thinking"), {
    id: "thinking", settings: { reasoningEffort: "high" }, body: { enable_thinking: true },
  });
  console.log("V2 late provider, host-modeled overlays, refresh, and publication retry checks passed");
} finally {
  await cleanup?.();
  console.error = originalError;
  globalThis.fetch = originalFetch;
}
