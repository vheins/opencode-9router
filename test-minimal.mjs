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

console.log("\n=== Test 2: Config hook — no provider configured ===");
const fakeConfig1 = {};
await hooks.config(fakeConfig1);
assert.deepEqual(fakeConfig1, {}, "Config should remain empty when provider not configured");
console.log("PASS");

console.log("\n=== Test 3: Config hook — provider configured with baseURL ===");
const fakeConfig2 = {
  provider: {
    "9router": {
      npm: "@ai-sdk/openai-compatible",
      name: "9Router",
      options: {
        baseURL: "http://localhost:20128",
      },
    },
  },
};
await hooks.config(fakeConfig2);
assert.ok(fakeConfig2.provider["9router"], "Provider should still exist after hook");
assert.ok(fakeConfig2.provider["9router"].options, "Provider should have options");
console.log(`baseURL after hook: ${fakeConfig2.provider["9router"].options.baseURL}`);
assert.ok(fakeConfig2.provider["9router"].options.baseURL.endsWith("/v1"), "baseURL should end with /v1");
assert.ok(fakeConfig2.provider["9router"].models, "Provider should have models");
const modelKeys = Object.keys(fakeConfig2.provider["9router"].models);
console.log(`Models discovered: ${modelKeys.length}`);
if (modelKeys.length > 0) {
  console.log("PASS (auto-discovered models from localhost)");
} else {
  console.log("PASS (no models — 9Router unreachable)");
}

console.log("\n=== Test 4: Config hook — custom baseURL ===");
const fakeConfig3 = {
  provider: {
    "9router": {
      npm: "@ai-sdk/openai-compatible",
      name: "9Router",
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
  const serialized = JSON.stringify(fakeConfig2);
  JSON.parse(serialized);
  console.log("PASS");
} catch (e) {
  assert.fail(`Serialization failed: ${e.message}`);
}

console.log("\n✅ All tests passed!");
