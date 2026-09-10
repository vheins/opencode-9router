// Regression tests for forced multimodal config on 9Router combo models.
// Verifies:
//   1. isComboModel prefers owned_by === "combo" and falls back to the
//      no-prefix heuristic only when owned_by is absent.
//   2. forceComboConfig returns the exact forced multimodal shape, including
//      the full thinking-level variant set and 256K/128K limits.
//   3. Prefixed, non-combo ids are never treated as combos.
import assert from "node:assert/strict";
import {
  isComboModel,
  forceComboConfig,
  findModelsDevMatch,
  findModelsDevMatchExact,
  isRealRouterSignal,
} from "./dist/capabilities.js";

console.log("=== Test 1: isComboModel honours owned_by === ");
assert.equal(isComboModel("executor", "combo"), true, "owned_by=combo should be a combo");
assert.equal(isComboModel("gpt-5.6-luna", "combo"), true, "owned_by=combo wins over id shape");
assert.equal(isComboModel("cc/claude-opus-4-7", "combo"), true, "owned_by=combo is authoritative");
assert.equal(isComboModel("executor", "inferhub"), false, "explicit non-combo owner is not a combo");
assert.equal(isComboModel("cc/foo", "inferhub"), false, "prefixed non-combo owner is not a combo");
console.log("PASS");

console.log("\n=== Test 2: isComboModel prefix fallback when owned_by absent ===");
assert.equal(isComboModel("executor"), true, "no-prefix id is a combo when owned_by absent");
assert.equal(isComboModel("explorer"), true, "no-prefix id is a combo when owned_by absent");
assert.equal(isComboModel("cc/foo"), false, "prefixed id is not a combo");
assert.equal(isComboModel("inferhub/combo/executor"), false, "prefixed combo id is not matched by fallback");
console.log("PASS");

console.log("\n=== Test 3: forceComboConfig multimodal shape ===");
const forced = forceComboConfig();
assert.equal(forced.attachment, true, "attachment must be forced true");
assert.equal(forced.tool_call, true, "tool_call must be forced true");
assert.equal(forced.reasoning, true, "reasoning must be forced true");
assert.deepEqual(
  forced.modalities,
  { input: ["text", "image", "audio"], output: ["text"] },
  "modalities must allow text/image/audio input and text output"
);
assert.equal(forced.search, false, "search must be forced false");
assert.deepEqual(
  forced.limit,
  { context: 262144, output: 131072 },
  "limit must default to 256K context / 128K output"
);
assert.equal(forced.context_length, 262144, "context_length extra key must be set");
assert.equal(forced.max_completion_tokens, 131072, "max_completion_tokens extra key must be set");
console.log("PASS");

console.log("\n=== Test 4: forceComboConfig thinking variants ===");
const efforts = ["low", "medium", "high", "xhigh", "max", "minimal", "thinking"];
assert.deepEqual(
  Object.keys(forced.variants),
  efforts,
  "variants must expose every requested thinking level"
);
for (const effort of efforts) {
  assert.deepEqual(
    forced.variants[effort],
    { reasoningEffort: effort },
    `variant ${effort} must forward reasoningEffort verbatim`
  );
}
console.log("PASS");

console.log("\n=== Test 5: findModelsDevMatchExact rejects loose substring hits ===");
const catalog = [
  { id: "openai/gpt-4-turbo-vision", attachment: true, tool_call: true },
  { id: "openai/gpt-5.6-luna", attachment: true, reasoning: true, limit: { context: 1050000, output: 128000 } },
  { id: "deepseek/deepseek-v4-flash", reasoning: true, limit: { context: 1000000, output: 384000 } },
];
assert.equal(
  findModelsDevMatchExact("vision", catalog),
  null,
  "loose substring match must be rejected for combos"
);
assert.ok(findModelsDevMatch("vision", catalog), "loose matcher still matches (non-combo path)");
assert.ok(findModelsDevMatchExact("gpt-5.6-luna", catalog), "exact segment match is accepted");
assert.ok(findModelsDevMatchExact("deepseek-v4-flash", catalog), "exact match works with prefix strip");
assert.equal(findModelsDevMatchExact("executor", catalog), null, "unknown combo has no exact match");
console.log("PASS");

console.log("\n=== Test 6: isRealRouterSignal ignores capability stubs ===");
assert.equal(
  isRealRouterSignal({ id: "executor", capabilities: { vision: false, audioInput: false, tools: true, reasoning: false, search: false } }),
  false,
  "bare tools:true stub is not a real signal"
);
assert.equal(
  isRealRouterSignal({ id: "m", capabilities: { vision: true } }),
  true,
  "vision is a real signal"
);
assert.equal(
  isRealRouterSignal({ id: "m", capabilities: { reasoning: true } }),
  true,
  "reasoning is a real signal"
);
assert.equal(
  isRealRouterSignal({ id: "m", capabilities: { audioInput: true } }),
  true,
  "audio input is a real signal"
);
assert.equal(
  isRealRouterSignal({ id: "m", context_length: 128000 }),
  true,
  "positive context_length is a real signal"
);
assert.equal(
  isRealRouterSignal({ id: "m", capabilities: { contextWindow: 0 } }),
  false,
  "invalid context window is not a signal"
);
console.log("PASS");

console.log("\n✅ All combo tests passed!");
