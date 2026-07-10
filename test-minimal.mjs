import assert from "node:assert/strict";
import { NineRouterPlugin } from "./dist/plugin.js";

const mockClient = { app: { log: async () => {} } };
const mockInput = { client: mockClient };

console.log("=== Test 1: Plugin returns hooks ===");
const hooks = await NineRouterPlugin(mockInput);
assert.ok(hooks, "Plugin should return hooks");
assert.equal(typeof hooks.config, "function", "hooks.config should be a function");
assert.equal(hooks.auth, undefined, "Plugin should not have auth hook");
console.log("PASS");

console.log("\n=== Test 2: Config hook — no pre-configured provider ===");
const fakeConfig1 = {};
await hooks.config(fakeConfig1);
assert.ok(fakeConfig1.provider, "Config should have provider after hook");
assert.ok(fakeConfig1.provider["9router"], "Provider should have 9router entry");
assert.equal(
  fakeConfig1.provider["9router"].options.baseURL,
  "http://localhost:20128/v1",
  "Should use default baseURL"
);
const modelKeys1 = Object.keys(fakeConfig1.provider["9router"].models);
console.log(`Models with default baseURL: ${modelKeys1.length}`);
if (modelKeys1.length > 0) {
  console.log("PASS (auto-discovered models from localhost)");
  // Check capability fields on first discovered model
  const firstModel = Object.values(fakeConfig1.provider["9router"].models)[0];
  const capKeys = Object.keys(firstModel).filter(k => k !== "name").sort();
  console.log(`Capability fields on first model: ${capKeys.join(", ") || "(none beyond name)"}`);
  // tool_call should always be present
  assert.equal(firstModel.tool_call, true, "tool_call should default to true");
} else {
  console.log("PASS (no models — 9Router unreachable)");
}

console.log("\n=== Test 3: Config hook — pre-configured provider with custom baseURL ===");
const fakeConfig2 = {
  provider: {
    "9router": {
      options: {
        baseURL: "http://localhost:20128",
        apiKey: "test-key",
      },
    },
  },
};
await hooks.config(fakeConfig2);
assert.ok(fakeConfig2.provider["9router"], "Provider should still exist after hook");
assert.equal(
  fakeConfig2.provider["9router"].options.baseURL,
  "http://localhost:20128/v1",
  "Should append /v1"
);
assert.equal(
  fakeConfig2.provider["9router"].options.apiKey,
  "test-key",
  "Should preserve apiKey"
);
assert.ok(fakeConfig2.provider["9router"].models, "Provider should have models");
const modelKeys2 = Object.keys(fakeConfig2.provider["9router"].models);
console.log(`Models discovered: ${modelKeys2.length}`);
if (modelKeys2.length > 0) {
  console.log("PASS (auto-discovered models from custom baseURL)");
  const firstModel2 = Object.values(fakeConfig2.provider["9router"].models)[0];
  const capKeys2 = Object.keys(firstModel2).filter(k => k !== "name").sort();
  console.log(`Capability fields on first model (apiKey): ${capKeys2.join(", ") || "(none beyond name)"}`);
} else {
  console.log("PASS (no models — 9Router unreachable)");
}

console.log("\n=== Test 4: Config hook — baseURL with /v1 already ===");
const fakeConfig3 = {
  provider: {
    "9router": {
      options: {
        baseURL: "http://localhost:20128/v1",
      },
    },
  },
};
await hooks.config(fakeConfig3);
assert.equal(
  fakeConfig3.provider["9router"].options.baseURL,
  "http://localhost:20128/v1",
  "Should not double-append /v1"
);
console.log("PASS");

console.log("\n=== Test 5: JSON serialization ===");
try {
  const serialized = JSON.stringify(fakeConfig1);
  JSON.parse(serialized);
  console.log("PASS");
} catch (e) {
  assert.fail(`Serialization failed: ${e.message}`);
}

console.log("\n✅ All tests passed!");
