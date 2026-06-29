import assert from "node:assert/strict";
import { NineRouterPlugin } from "./dist/plugin.js";

const mockClient = { app: { log: async () => {} } };
const mockInput = { client: mockClient };

console.log("=== Test 1: Plugin returns hooks ===");
const hooks = await NineRouterPlugin(mockInput);
assert.ok(hooks, "Plugin should return hooks");
assert.equal(typeof hooks.config, "function", "hooks.config should be a function");
assert.equal(typeof hooks.auth, "object", "hooks.auth should be an object");
assert.equal(hooks.auth.provider, "9router", "auth.provider should be '9router'");
console.log("PASS");

console.log("\n=== Test 2: Auth methods ===");
assert.ok(Array.isArray(hooks.auth.methods), "auth.methods should be an array");
assert.equal(hooks.auth.methods.length, 1, "Should have 1 auth method");
assert.equal(hooks.auth.methods[0].type, "api", "Auth method should be type 'api'");
assert.ok(hooks.auth.methods[0].label.includes("9Router"), "Label should mention 9Router");
const prompts = hooks.auth.methods[0].prompts;
assert.ok(Array.isArray(prompts), "Method should have prompts");
assert.equal(prompts.length, 2, "Should have 2 prompts (baseURL + apiKey)");
assert.equal(prompts[0].key, "baseURL", "First prompt key should be baseURL");
assert.equal(prompts[1].key, "apiKey", "Second prompt key should be apiKey");
console.log("PASS");

console.log("\n=== Test 3: Config hook injects provider ===");
const fakeConfig = {};
await hooks.config(fakeConfig);
assert.ok(fakeConfig.provider, "Config should have provider after hook");
assert.ok(fakeConfig.provider["9router"], "Provider should have 9router entry");
const providerDef = fakeConfig.provider["9router"];
assert.equal(providerDef.npm, "@ai-sdk/openai-compatible", "npm should be @ai-sdk/openai-compatible");
assert.equal(providerDef.name, "9Router", "name should be 9Router");
assert.ok(providerDef.options, "Provider should have options");
assert.ok(providerDef.options.baseURL.endsWith("/v1"), "baseURL should end with /v1");
assert.ok(providerDef.models, "Provider should have models");
const modelKeys = Object.keys(providerDef.models);
assert.ok(modelKeys.length > 0, "Should have at least 1 model");
console.log(`PASS (${modelKeys.length} models registered)`);

console.log("\n=== Test 4: Auth loader — baseURL handling ===");
const loader = hooks.auth.loader;

const auth1 = await loader(async () => ({ baseURL: "http://localhost:20128" }));
assert.equal(auth1.baseURL, "http://localhost:20128/v1", "Should append /v1 when missing");

const auth2 = await loader(async () => ({ baseURL: "http://localhost:20128/v1" }));
assert.equal(auth2.baseURL, "http://localhost:20128/v1", "Should NOT double-append /v1");

const auth3 = await loader(async () => ({ baseURL: "http://localhost:20128/" }));
assert.equal(auth3.baseURL, "http://localhost:20128/v1", "Should strip trailing slash then append /v1");

const auth4 = await loader(async () => ({ baseURL: "http://192.168.1.100:20128/v1/" }));
assert.equal(auth4.baseURL, "http://192.168.1.100:20128/v1", "Should strip trailing slash, keep /v1");

const auth5 = await loader(async () => ({}));
assert.deepEqual(auth5, {}, "Should return empty object when no baseURL");

console.log("PASS");

console.log("\n=== Test 5: Plugin options — custom baseURL ===");
const hooks2 = await NineRouterPlugin(mockInput, { baseURL: "http://custom:9999" });
const fakeConfig2 = {};
await hooks2.config(fakeConfig2);
assert.equal(
  fakeConfig2.provider["9router"].options.baseURL,
  "http://custom:9999/v1",
  "Should use custom baseURL from options"
);
console.log("PASS");

console.log("\n=== Test 6: Model formatting ===");
const fallbackKeys = Object.keys(fakeConfig.provider["9router"].models);
const krModel = fallbackKeys.find(k => k.startsWith("kr/"));
if (krModel) {
  const modelName = fakeConfig.provider["9router"].models[krModel].name;
  assert.ok(!modelName.startsWith("kr/"), "Formatted name should not contain prefix");
  assert.ok(modelName.includes("Kiro"), "Formatted name should include provider name");
  console.log(`PASS (${krModel} → "${modelName}")`);
} else {
  console.log("SKIP (no kr/ model in fallback)");
}

console.log("\n=== Test 7: JSON serialization ===");
try {
  const serialized = JSON.stringify(fakeConfig);
  JSON.parse(serialized);
  console.log("PASS");
} catch (e) {
  assert.fail(`Serialization failed: ${e.message}`);
}

console.log("\n✅ All tests passed!");
