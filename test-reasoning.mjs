import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapRouterCapabilities, forceComboConfig } from "./dist/capabilities.js";
import { discoverModels } from "./dist/discovery.js";
import { toModelInfo } from "./dist/v2-map.js";

assert.deepEqual(mapRouterCapabilities({ id: "missing" }), {});
assert.deepEqual(mapRouterCapabilities({ id: "missing", capabilities: {} }), {});
for (const value of [true, false]) {
  assert.deepEqual(
    mapRouterCapabilities({ id: "boolean", capabilities: { reasoning: value, tools: value } }),
    { reasoning: value, tool_call: value },
  );
}
assert.deepEqual(
  mapRouterCapabilities({ id: "invalid", capabilities: { reasoning: "false", tools: "true" } }),
  {},
  "non-boolean capability values must not enable reasoning or tools",
);

const originalFetch = globalThis.fetch;
const originalCacheHome = process.env.XDG_CACHE_HOME;
const cacheHome = await mkdtemp(join(tmpdir(), "opencode-9router-reasoning-"));
process.env.XDG_CACHE_HOME = cacheHome;
const requests = [];
const alwaysOn = {
  reasoning: true,
  tools: false,
  thinkingCanDisable: false,
  thinkingEffortSupported: false,
  contextWindow: 128000,
  maxOutput: 16000,
};
const rows = [
  { id: "example/always-on", owned_by: "example", capabilities: { ...alwaysOn, vision: true } },
  { id: "always-on-combo", owned_by: "combo", capabilities: alwaysOn },
  { id: "stub-combo", owned_by: "combo", capabilities: { tools: true } },
  { id: "disabled-combo", owned_by: "combo", capabilities: { tools: false, reasoning: false } },
  { id: "example/limits-only", owned_by: "example" },
  { id: "example/disabled", owned_by: "example", capabilities: { reasoning: false, tools: false } },
  { id: "example/legacy", owned_by: "example" },
  { id: "example/partial", owned_by: "example", capabilities: { tools: false } },
  { id: "example/info-only", owned_by: "example" },
];
const catalog = Object.fromEntries([
  ["example/always-on", { reasoning: false, tool_call: true, limit: { context: 4096, output: 1024 } }],
  ["example/disabled", { reasoning: true, tool_call: true }],
  ["example/legacy", { reasoning: true, tool_call: false, limit: { context: 64000, output: 8000 } }],
  ["example/partial", { reasoning: true, tool_call: true, limit: { context: 32000, output: 4000 } }],
  ["example/limits-only", { limit: { context: 64000, output: 8000 } }],
].map(([id, fields]) => [id, { id, ...fields }]));

globalThis.fetch = async (input) => {
  const url = String(input);
  requests.push(url);
  if (url.includes("/models/info")) {
    if (new URL(url).searchParams.get("id") === "example/info-only") {
      return Response.json({ id: "example/info-only", capabilities: alwaysOn });
    }
    return new Response(null, { status: 404 });
  }
  if (url.endsWith("/models")) return Response.json({ data: rows });
  if (url.includes("models.dev")) return Response.json({ example: { models: catalog } });
  throw new Error(`Unexpected fetch: ${url}`);
};

try {
  const models = await discoverModels(
    "https://router.invalid/v1", undefined, true, 3600, 1000, "reasoning-test", async () => {},
  );
  assert.ok(models);
  const model = models["example/always-on"];
  assert.equal(model.reasoning, true, "bulk reasoning overrides conflicting catalog metadata");
  assert.equal(model.tool_call, false, "explicit bulk tools:false overrides defaults and catalog");
  assert.equal(model.attachment, true);
  assert.deepEqual(model.modalities, { input: ["text", "image"], output: ["text"] });
  assert.deepEqual(model.limit, { context: 128000, output: 16000 });
  assert.equal(models["disabled-combo"].reasoning, false);
  assert.equal(models["disabled-combo"].tool_call, false);
  assert.equal(models["disabled-combo"].variants, undefined, "disabled tools are not a legacy combo stub");
  assert.equal(models["example/limits-only"].tool_call, true, "missing catalog tools must not become false");
  assert.equal(models["example/limits-only"].reasoning, undefined, "missing catalog reasoning stays absent");
  assert.equal(models["example/disabled"].reasoning, false);
  assert.equal(models["example/disabled"].tool_call, false);
  assert.equal(models["example/legacy"].reasoning, true, "legacy rows retain catalog fallback");
  assert.equal(models["example/legacy"].tool_call, false);
  assert.deepEqual(models["example/legacy"].limit, { context: 64000, output: 8000 });
  assert.equal(models["example/partial"].reasoning, true, "absent bulk fields do not erase fallback");
  assert.equal(models["example/partial"].tool_call, false);
  assert.deepEqual(models["example/partial"].limit, { context: 32000, output: 4000 });
  assert.equal(models["example/info-only"].reasoning, true, "per-model fallback still works");
  assert.equal(models["always-on-combo"].reasoning, true);
  assert.equal(models["always-on-combo"].variants, undefined, "real bulk signal suppresses forced efforts");
  assert.deepEqual(models["stub-combo"].variants, forceComboConfig().variants, "bare combo stub retains existing fallback");

  for (const id of ["example/always-on", "always-on-combo"]) {
    assert.equal(models[id].variants, undefined, "always-on support does not imply effort controls");
    const info = toModelInfo("9router", id, models[id]);
    assert.deepEqual(info.variants, []);
    assert.equal(info.settings, undefined, "no thinking or effort settings are invented");
    assert.equal(info.capabilities.tools, false);
    assert.deepEqual(info.limit, { context: 128000, output: 16000 });
  }

  const count = requests.length;
  const cached = await discoverModels(
    "https://router.invalid/v1", undefined, true, 3600, 1000, "reasoning-test", async () => {},
  );
  assert.equal(requests.length, count, "updated metadata survives discovery cache round-trip");
  assert.deepEqual(JSON.parse(JSON.stringify(cached)), JSON.parse(JSON.stringify(models)));
  console.log("Reasoning metadata discovery and V2 regression checks passed");
} finally {
  globalThis.fetch = originalFetch;
  if (originalCacheHome === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = originalCacheHome;
  await rm(cacheHome, { recursive: true, force: true });
}
