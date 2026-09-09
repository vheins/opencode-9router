// Regression tests for limit.context / limit.output population during model
// discovery (PR #2). Verifies:
//   1. mapRouterCapabilities copies contextWindow/maxOutput (nested) and
//      falls back to context_length/max_completion_tokens (top-level).
//   2. Invalid upstream values (0, NaN, Infinity, floats, junk strings) never
//      produce a limit — toPositiveInt guards every assignment.
//   3. findModelsDevMatch mirrors models.dev entry limit into capabilities so
//      catalog limits reach config.limit through the same validated path.
import assert from "node:assert/strict";
import { mapRouterCapabilities, findModelsDevMatch } from "./dist/capabilities.js";
import { toPositiveInt } from "./dist/utils.js";

console.log("=== Test 1: toPositiveInt validation ===");
const invalidValues = [
  undefined, 0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY,
  "", " ", "0", "-10", "1.5", "abc", "NaN", "Infinity", "9007199254740992",
];
for (const value of invalidValues) {
  assert.equal(
    toPositiveInt(value),
    undefined,
    `toPositiveInt(${String(value)}) should be undefined`
  );
}
for (const value of [1, "1", 200000, "200000", 1000000, 128000, "128000"]) {
  const result = toPositiveInt(value);
  assert.ok(result !== undefined, `toPositiveInt(${String(value)}) should be a number`);
  assert.equal(Number.isSafeInteger(result), true, `toPositiveInt(${String(value)}) should be an integer`);
  assert.ok(result > 0, `toPositiveInt(${String(value)}) should be positive`);
}
console.log("PASS");

console.log("\n=== Test 2: limit from nested capabilities.contextWindow/maxOutput ===");
const nested = mapRouterCapabilities({
  id: "cc/",
  capabilities: { vision: true, tools: true, contextWindow: 1000000, maxOutput: 128000 },
});
assert.deepEqual(nested.limit, { context: 1000000, output: 128000 }, "nested contextWindow/maxOutput should map to limit");
assert.equal(nested.attachment, true, "vision should still map to attachment");
assert.equal(nested.tool_call, true, "tools should still map to tool_call");
console.log("PASS");

console.log("\n=== Test 3: numeric-string limits are coerced ===");
const coerced = mapRouterCapabilities({
  id: "cc/",
  capabilities: { contextWindow: "200000", maxOutput: "32000" },
});
assert.deepEqual(coerced.limit, { context: 200000, output: 32000 }, "numeric strings should coerce to numbers");
console.log("PASS");

console.log("\n=== Test 4: top-level context_length/max_completion_tokens fallback ===");
const fallback = mapRouterCapabilities({
  id: "cc/",
  capabilities: { vision: true },
  context_length: 32000,
  max_completion_tokens: 8192,
});
assert.deepEqual(fallback.limit, { context: 32000, output: 8192 }, "top-level fields should be used when nested absent");
assert.equal(fallback.attachment, true, "vision capability should survive fallback path");
console.log("PASS");

console.log("\n=== Test 5: nested capabilities win over top-level fallback ===");
const precedence = mapRouterCapabilities({
  id: "cc/",
  capabilities: { contextWindow: 64000, maxOutput: 16000 },
  context_length: 32000,
  max_completion_tokens: 8192,
});
assert.deepEqual(precedence.limit, { context: 64000, output: 16000 }, "capabilities.* should take precedence");
console.log("PASS");

console.log("\n=== Test 6: invalid values never produce a limit ===");
const invalidInfos = [
  { id: "m", capabilities: { contextWindow: 0 } },
  { id: "m", capabilities: { contextWindow: -10 } },
  { id: "m", capabilities: { contextWindow: 1.5 } },
  { id: "m", capabilities: { contextWindow: Number.NaN } },
  { id: "m", capabilities: { contextWindow: Number.POSITIVE_INFINITY } },
  { id: "m", capabilities: { contextWindow: "abc" } },
  { id: "m", capabilities: { contextWindow: "" } },
  { id: "m", capabilities: { contextWindow: "0" } },
  { id: "m", context_length: 0 },
  { id: "m", context_length: "junk" },
];
for (const info of invalidInfos) {
  const config = mapRouterCapabilities(info);
  assert.equal(config.limit, undefined, `limit should be unset for ${JSON.stringify(info)}`);
}
// Valid context with invalid output → context kept, output dropped
const partial = mapRouterCapabilities({
  id: "m",
  capabilities: { contextWindow: 100000, maxOutput: 0 },
});
assert.deepEqual(partial.limit, { context: 100000 }, "valid context with invalid output should keep context only");
console.log("PASS");

console.log("\n=== Test 7: models.dev catalog limits flow via findModelsDevMatch ===");
const catalog = [
  { id: "openai/gpt-5.2", attachment: true, tool_call: true, limit: { context: 1000000, output: 32000 } },
  { id: "anthropic/claude-sonnet-5", limit: { context: 200000, output: 64000 } },
];
const match = findModelsDevMatch("oc/gpt-5.2", catalog);
assert.ok(match, "models.dev should match oc/gpt-5.2");
const fromCatalog = mapRouterCapabilities(match);
assert.deepEqual(
  fromCatalog.limit,
  { context: 1000000, output: 32000 },
  "models.dev entry limit.context/output should reach config.limit"
);
assert.equal(fromCatalog.attachment, true, "models.dev attachment should still map");
assert.equal(fromCatalog.tool_call, true, "models.dev tool_call should still map");
console.log("PASS");

console.log("\n=== Test 8: models.dev entry without limit yields no limit ===");
const noLimitMatch = findModelsDevMatch("oc/gpt-5.2", [
  { id: "openai/gpt-5.2", attachment: true },
]);
assert.ok(noLimitMatch, "entry without limit should still match");
const noLimitConfig = mapRouterCapabilities(noLimitMatch);
assert.equal(noLimitConfig.limit, undefined, "limit stays unset when models.dev entry has no limit");
assert.equal(noLimitConfig.attachment, true, "other capabilities still mapped");
console.log("PASS");

console.log("\n=== Test 9: no match returns null ===");
assert.equal(findModelsDevMatch("oc/unknown-model", catalog), null, "no catalog match should return null");
console.log("PASS");

console.log("\n✅ All tests passed!");
