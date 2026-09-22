import { Plugin } from "@opencode/plugin";
import { NineRouterPlugin } from "./plugin.js";
import { nineRouterV2 } from "./v2.js";

// ── Dual V1 + V2 Package Entry ──────────────────────────────

/**
 * Combined plugin export. OpenCode V2 reads the `setup`/`id` fields produced by
 * `Plugin.define`; OpenCode V1 (1.18.29+) reads the `server` field. Both
 * implementations share the same discovery core.
 *
 * `nineRouterV2` is passed through `Plugin.define` for validation, but the
 * default export is written as an explicit object literal so the emitted
 * declaration is stable and clearly includes `id`, `setup`, and `server`.
 */
const v2 = Plugin.define(nineRouterV2);

export default {
  id: v2.id,
  setup: v2.setup,
  server: NineRouterPlugin,
};

// Named export retained for V1 consumers that import it directly.
export { NineRouterPlugin };
