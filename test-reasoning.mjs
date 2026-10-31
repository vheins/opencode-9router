import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { flattenModelsDevCatalog, readDiscoveryCache, readStaleDiscoveryCache } from "./dist/cache.js";
import { findReasoningOptions } from "./dist/reasoning.js";
import { toModelInfo } from "./dist/v2-map.js";
import { discoverModels } from "./dist/discovery.js";
import { forceComboConfig } from "./dist/capabilities.js";
import { DISCOVERY_CACHE_VERSION } from "./dist/constants.js";

// Captured models.dev shapes; no router, inference, or credentials needed.
const entry = (id, reasoning_options) => ({ id, reasoning: true, reasoning_options });
const effort = (...values) => [{ type: "effort", values }];
const raw = {
  collision: { models: { wrong: entry("z-ai/glm-5.3-flash", effort("medium")) } },
  openrouter: { models: {
    glm: entry("z-ai/glm-5.3-flash", effort("low", "high", "max")),
    gpt: entry("openai/gpt-5.6-sol", effort("none", "low", "medium", "high", "xhigh", "max")),
    gemini: entry("google/gemini-3.8-flash", effort("low", "medium", "high")),
    claude: entry("anthropic/claude-opus-5.5", effort("low", "medium", "high", "xhigh", "max")),
    toggle: entry("z-ai/glm-4.6v", [{ type: "toggle" }]),
    free: { id: "openrouter/free", reasoning: true },
  } },
  zai: { models: { glm: entry("glm-5.3-flash", effort("low", "high")) } },
  google: { models: { gemini: entry("gemini-3.8-flash", effort("low", "medium", "high")) } },
  another: { models: { model: entry("vendor/model", effort("none", "high")) } },
  volcengine: { models: { model: entry("doubao-model", effort("low", "high")) } },
  "cloudflare-workers-ai": { models: { model: entry("@cf/zai-org/glm-5.3", effort("low", "high", "max")) } },
};
const catalog = flattenModelsDevCatalog(raw);
assert.equal(raw.openrouter.models.glm.catalogProvider, undefined, "flattening must not mutate cached input");
const modes = (id) => findReasoningOptions(id, catalog);
assert.deepEqual(modes("openrouter/z-ai/glm-5.3-flash"), effort("low", "high", "max"));
assert.deepEqual(modes("glm/glm-5.3-flash"), effort("low", "high"));
assert.deepEqual(modes("google/gemini-3.8-flash"), effort("low", "medium", "high"));
assert.deepEqual(modes("another/vendor/model"), effort("none", "high"));
assert.deepEqual(modes("doubao/doubao-model"), effort("low", "high"));
assert.deepEqual(modes("cloudflare-ai/@cf/zai-org/glm-5.3"), effort("low", "high", "max"));
for (const id of ["unknown/z-ai/glm-5.3-flash", "openrouter/glm-5.3-flash", "openrouter/z-ai/glm-5.3-flash:free", "openrouter/z-ai/glm-5-3-flash", "executor", "openrouter/openrouter/free"]) {
  assert.equal(modes(id), undefined, `no invented controls for ${id}`);
}
assert.equal(findReasoningOptions("openrouter/z-ai/glm-5.3-flash", [...catalog, catalog.find((e) => e.catalogProvider === "openrouter")]), undefined, "ambiguous exact matches stay unknown");
for (const invalid of [null, {}, [{ type: "effort", values: "high" }], [{ type: "budget_tokens", min: 1024 }]]) {
  assert.equal(findReasoningOptions("test/model", [{ catalogProvider: "test", ...entry("model", invalid) }]), undefined);
}
assert.deepEqual(findReasoningOptions("test/model", [{ catalogProvider: "test", ...entry("model", [null, { type: "effort", values: ["high", "high", "default", "ultra", 1, "__proto__"] }]) }]), effort("high"));
assert.equal(findReasoningOptions("test/model", [{ catalogProvider: "test", ...entry("model", effort("high")), reasoning: false }]), undefined);

const info = (options, extra = {}) => toModelInfo("9router", "test/model", { name: "Test", reasoning_options: options, ...extra });
assert.deepEqual(info(effort("low", "high", "max")).variants, ["low", "high", "max"].map((id) => ({ id, settings: { reasoningEffort: id } })));
assert.deepEqual(info([{ type: "toggle" }]).variants, [
  { id: "none", body: { enable_thinking: false } },
  { id: "thinking", body: { enable_thinking: true } },
]);
assert.deepEqual(info(effort("high"), { variants: {} }).variants, []);
assert.deepEqual(info(effort("high"), { variants: { custom: { reasoningEffort: "low" } } }).variants, [{ id: "custom", settings: { reasoningEffort: "low" } }]);
assert.equal(info(effort("high")).settings?.reasoningEffort, undefined, "no default effort injected");

const temp = await mkdtemp(join(tmpdir(), "opencode-9router-reasoning-"));
const previousCache = process.env.XDG_CACHE_HOME;
const originalFetch = globalThis.fetch;
process.env.XDG_CACHE_HOME = temp;
try {
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests++;
    const url = String(input);
    if (url.includes("models.dev") || url.includes("api.json")) return Response.json(raw);
    if (url.includes("/models/info")) return Response.json({ id: "executor", capabilities: { tools: true } });
    return Response.json({ data: [
      ...Object.values(raw.openrouter.models).map((m) => ({ id: `openrouter/${m.id}`, owned_by: "openrouter", capabilities: { reasoning: true, contextWindow: 200000 } })),
      { id: "glm/glm-5.3-flash", owned_by: "glm" },
      { id: "another/vendor/model", owned_by: "another" },
      { id: "executor", owned_by: "combo", capabilities: { reasoning: true, vision: true, contextWindow: 200000 } },
    ] });
  };
  const discover = () => discoverModels("https://router.test", undefined, true, 60000, 1000, "9router", async () => {});
  const models = await discover();
  assert.ok(models);
  for (const model of Object.values(raw.openrouter.models)) {
    const id = `openrouter/${model.id}`;
    assert.deepEqual(models[id].reasoning_options, modes(id));
    assert.deepEqual(toModelInfo("9router", id, models[id]).variants, info(modes(id)).variants);
  }
  assert.deepEqual(models.executor.variants, forceComboConfig().variants, "bulk combo capabilities must not suppress existing variants");
  assert.equal(models.executor.reasoning_options, undefined);
  const before = requests;
  assert.deepEqual(JSON.parse(JSON.stringify(await discover())), JSON.parse(JSON.stringify(models)), "cache round trip preserves controls");
  assert.equal(requests, before, "fresh discovery cache avoids fetches");
  const file = join(temp, "opencode-9router", `discovery-9router-${Buffer.from("https://router.test").toString("base64url")}.json`);
  assert.equal(JSON.parse(await readFile(file, "utf8")).v, DISCOVERY_CACHE_VERSION);
  assert.ok(DISCOVERY_CACHE_VERSION > 4, "invalidate regressive draft caches too");
  await writeFile(file, JSON.stringify({ v: 4, models }));
  assert.equal(readDiscoveryCache("https://router.test", 60000, "9router"), null);
  assert.equal(readStaleDiscoveryCache("https://router.test", "9router"), null);
} finally {
  globalThis.fetch = originalFetch;
  if (previousCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = previousCache;
  await rm(temp, { recursive: true, force: true });
}
// Exercise the installed adapter and HTTP overlays, not a hand-written serializer.
const { createRequire } = await import("node:module");
const { pathToFileURL } = await import("node:url");
// Resolve the adapter's Effect version, not the legacy plugin's separate copy.
const adapterRequire = createRequire(import.meta.resolve("@opencode/ai"));
const { Effect, Layer } = await import(pathToFileURL(adapterRequire.resolve("effect")).href);
let httpModule;
try { httpModule = adapterRequire.resolve("effect/http"); }
catch { httpModule = adapterRequire.resolve("effect/unstable/http"); }
const { HttpClientRequest, HttpClientResponse } = await import(pathToFileURL(httpModule).href);
const { LLM, LLMClient } = await import("@opencode/ai");
const { model } = await import("@opencode/ai/providers/openai-compatible");
const { RequestExecutor } = await import("@opencode/ai/route");
const captured = [];
const executor = Layer.succeed(RequestExecutor.Service, RequestExecutor.Service.of({
  execute: (request) => Effect.gen(function* () {
    const web = yield* HttpClientRequest.toWeb(request);
    captured.push({ url: web.url, body: JSON.parse(yield* Effect.promise(() => web.text())) });
    const event = { id: "capture", object: "chat.completion.chunk", created: 0, model: "catalog-model", choices: [{ index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: "stop" }] };
    return HttpClientResponse.fromWeb(request, new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } }));
  }),
}));
const runtime = LLMClient.layer.pipe(Layer.provide(executor));
const variants = [...info(effort("low", "high", "max")).variants, ...info([{ type: "toggle" }]).variants, {}];
for (const variant of variants) {
  await Effect.runPromise(LLM.generate(LLM.request({
    model: model("catalog-model", { baseURL: "https://capture.invalid/v1", apiKey: "unused", ...variant.settings, body: variant.body }),
    prompt: "ping",
  })).pipe(Effect.provide(runtime)));
}
assert.equal(captured.length, 6);
for (let i = 0; i < 3; i++) assert.equal(captured[i].body.reasoning_effort, ["low", "high", "max"][i]);
assert.equal(captured[3].body.enable_thinking, false);
assert.equal(captured[4].body.enable_thinking, true);
for (const request of captured) assert.equal(request.url, "https://capture.invalid/v1/chat/completions");
for (const request of captured.slice(3)) assert.equal("reasoning_effort" in request.body, false);
assert.equal("reasoning" in captured[5].body, false, "unselected mode preserves upstream defaults");
console.log("Reasoning catalog, variants, combos, cache, and captured adapter requests passed");
