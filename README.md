# @vheins/opencode-9router

OpenCode plugin provider for [9Router](https://github.com/decolua/9router) — FREE AI Router & Token Saver. 40+ providers, 100+ models.

Registers 9Router as a custom provider in OpenCode with auto-discovery of models.

> **Dual V1 + V2 support.** This package ships a single entrypoint that works on both **OpenCode V1** (via the V1 `server` hook, OpenCode `1.18.29`+) and **OpenCode V2** (via the V2 `Plugin.define({ id, setup })` API). The discovery core is shared; only the plugin entrypoint differs. No separate package is needed.

## Quick Start

### OpenCode V1

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"]
}
```

1. Add the plugin to `opencode.json`
2. Restart OpenCode
3. `/models` → select a 9Router model

### OpenCode V2

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@vheins/opencode-9router@latest"]
}
```

Or with plugin options (object form):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "@vheins/opencode-9router@latest",
      "options": {
        "baseURL": "http://localhost:20128",
        "apiKey": "{env:ROUTER_API_KEY}",
        "cache": true,
        "cacheTTL": 10800000,
        "discoveryTimeout": 30000
      }
    }
  ]
}
```

The plugin will auto-discover models from `http://localhost:20128` (default).

## Features

- **Auto-discover models** — Models from 9Router are automatically detected on startup
- **Smart caching** — Discovery results cached for 3 hours (configurable) for instant subsequent loads
- **Stale fallback** — If the backend is unreachable, returns cached models instead of failing
- **Configurable timeout** — Adjustable discovery timeout (default 30s) for slow backends
- **Dynamic model list** — All models from 9Router are available, including custom combos
- **Combo multimodal defaults** — Combo models (`owned_by: "combo"`) that expose no capability info are forced to accept text/image/audio input with tool calling, reasoning, 256K context, 128K output, and `low`/`medium`/`high`/`xhigh`/`max`/`minimal`/`thinking` variants
- **OpenAI-compatible** — Uses `@ai-sdk/openai-compatible` (V1) / `@opencode/ai/providers/openai-compatible` (V2)
- **Type-safe** — Uses the `config` hook (V1) / provider transforms (V2) for provider registration that conforms to the OpenCode config schema

## OpenCode V2

OpenCode V2 replaces the V1 `plugin` config key with `plugins` and the single-function plugin shape with `Plugin.define({ id, setup })`. This package handles both — the same published entrypoint is loaded by V1 and V2.

### Configure (V2)

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@vheins/opencode-9router@latest"]
}
```

For a local checkout, keep the directory path in the V2 `plugins` list:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-9router"]
}
```

The local directory must expose a root `server` entrypoint; this repository provides `server.js` for that purpose. The V1 configuration key remains `plugin` and can continue to use the published package name as shown above.

Plugin options use the object form (`{ "package": ..., "options": { ... } }`) and are read from `ctx.options`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "@vheins/opencode-9router@latest",
      "options": {
        "baseURL": "http://localhost:20128",
        "apiKey": "{env:ROUTER_API_KEY}",
        "cache": true,
        "cacheTTL": 10800000,
        "discoveryTimeout": 30000
      }
    }
  ]
}
```

### Providers (V2)

In V2, providers are declared under the `providers` key. Each 9router-family provider uses the OpenAI-compatible runtime package and carries the endpoint in `settings.baseURL`. The plugin discovers models for every provider whose ID starts with `9router` and fills in the model list.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@vheins/opencode-9router@latest"],
  "providers": {
    "9router": {
      "name": "9Router",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://localhost:20128/v1",
        "apiKey": "{env:ROUTER_API_KEY}"
      }
    },
    "9router-remote": {
      "name": "Remote 9Router",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://your-9router-endpoint.example.com/v1"
      }
    }
  }
}
```

If no 9router-family provider exists, the plugin registers a default `9router` provider pointing at `http://localhost:20128`. A background refresh re-discovers models and calls `ctx.provider.reload()` every 5 minutes; the discovery interval is cleaned up when the plugin unloads.

### Dual V1 + V2 entrypoint

The default export exposes both implementations:

```ts
import { Plugin } from "@opencode/plugin"
import { NineRouterPlugin } from "./plugin.js"   // V1
import { nineRouterV2 } from "./v2.js"           // V2

const v2 = Plugin.define(nineRouterV2)
export default { id: v2.id, setup: v2.setup, server: NineRouterPlugin }
export { NineRouterPlugin }
```

V2 reads `id`/`setup`; V1 (1.18.29+) reads `server`. The named `NineRouterPlugin` export is kept for older V1 consumers. For local development, the repository also includes a root `server.js` bridge because OpenCode resolves an absolute plugin directory through its `server` entrypoint. The published package exposes the same entry through the `./server` export.

## Installation

### From npm (recommended)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"]
}
```

No need to define a provider manually — the plugin registers it automatically.

### Multiple Providers

Add one or more 9Router-family providers with custom options:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"],
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Your Provider",
      "options": {
        "baseURL": "https://your-9router-endpoint.example.com/v1",
        "apiKey": "{env:ROUTER_API_KEY}",
        "cache": true,
        "cacheTTL": 10800000,
        "discoveryTimeout": 60000
      }
    },
    "9router-local": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Router",
      "options": {
        "baseURL": "http://127.0.0.1:20128/v1",
        "apiKey": "sk-...",
        "cache": true,
        "discoveryTimeout": 60000
      }
    }
  }
}
```

Each provider key must start with `9router`. The `npm` must be `@ai-sdk/openai-compatible`. The `name` is a display label shown in OpenCode.

> **Never commit real API keys.** Replace the `baseURL`/`apiKey` above with your own endpoint and a placeholder such as `{env:ROUTER_API_KEY}` (or a dummy value like `sk-...`). Real keys belong in environment variables, not in `opencode.json` or this README.

### With Environment Variable

```json
{
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Remote 9Router",
      "options": {
        "baseURL": "https://example.com/v1",
        "apiKey": "{env:ROUTER_API_KEY}",
        "cache": true,
        "discoveryTimeout": 30000
      }
    }
  }
}
```

```bash
export ROUTER_API_KEY=your-api-key-here
opencode
```

## Provider Options

| Option                | Type      | Default     | Description                                            |
| --------------------- | --------- | ----------- | ------------------------------------------------------ |
| `baseURL`               | `string`    | `http://localhost:20128` | 9Router API endpoint                                   |
| `apiKey`                | `string`    | —           | API key (if required by backend)                       |
| `cache`                 | `boolean`   | `true`      | Cache discovery results to `~/.cache/opencode-9router/` |
| `cacheTTL`              | `number`    | `10800000` (3h) | Cache TTL in milliseconds                           |
| `discoveryTimeout`      | `number`    | `30000` (30s)  | Timeout for `/v1/models` request in milliseconds     |

### Example with cache and timeout tuning

```json
{
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Router",
      "options": {
        "baseURL": "http://localhost:20128",
        "cache": true,
        "discoveryTimeout": 60000
      }
    },
    "9router-remote": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Remote API",
      "options": {
        "baseURL": "https://your-9router-endpoint.example.com/v1",
        "apiKey": "{env:ROUTER_API_KEY}",
        "cacheTTL": 3600000
      }
    }
  }
}
```

### Disable cache

```json
{
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local Router",
      "options": {
        "baseURL": "http://localhost:20128",
        "apiKey": "sk-...",
        "cache": false,
        "discoveryTimeout": 30000
      }
    }
  }
}
```

## Usage

### Select a model

```
/models
  → Find the 9Router provider
  → Pick any model (e.g., kr/claude-sonnet-4.5, cc/claude-opus-4-7)
```

## Model Prefixes

| Prefix | Provider | Tier |
|--------|----------|------|
| `cc/` | Claude Code | Subscription |
| `cx/` | Codex | Subscription |
| `gh/` | GitHub Copilot | Subscription |
| `cu/` | Cursor IDE | Subscription |
| `kr/` | Kiro AI | **FREE** |
| `oc/` | OpenCode Free | **FREE** |
| `vertex/` | Vertex AI | $300 credits |
| `glm/` | GLM | $0.6/1M |
| `minimax/` | MiniMax | $0.2/1M |
| `kimi/` | Kimi | $9/mo flat |
| `openrouter/` | OpenRouter | API key |
| `deepseek/` | DeepSeek | API key |
| `groq/` | Groq | API key |

## How It Works

```
opencode.json "plugin": ["@vheins/opencode-9router@latest"]
  ↓
Plugin loads at startup detects 9Router-family providers in config
  ↓
For each provider:
  1. Check local cache (~/.cache/opencode-9router/discovery-*.json)
     └─ Fresh cache (≤3h) → return cached models instantly
  2. If cache miss/stale:
     └─ GET {baseURL}/v1/models with 30s timeout (configurable)
     └─ If OK → register live models + save to cache
     └─ If fail → fallback to stale cache (if exists), else skip
  ↓
config hook creates/updates provider with discovered models
  ↓
Provider appears in /models
```

### Cache storage

Cache files are stored at `~/.cache/opencode-9router/discovery-{base64url}.json`, one per unique `baseURL`. The cache directory also stores the models.dev capability catalog (`models-dev.json`).

## Changelog

### v0.9.1 — V2 model registration for configured providers
- Fix V2 plugin setup ordering: external plugins run before OpenCode's internal config-provider plugin, so config-defined `9router*` providers are not visible during setup
- Register a model transform (`ctx.model.transform`) that injects the discovered inventory into providers once they become available
- Refresh targets after setup with bounded retries and `provider.updated` events, then `ctx.model.reload()`
- Add a root `server.js` entrypoint and `./server` package export so an absolute local plugin path resolves
- Add `test-v2.mjs` covering the package entrypoint and the late config-provider lifecycle

### v0.9.0 — OpenCode V2 support (dual V1 + V2)
- Add a V2 plugin (`src/v2.ts`) built with `Plugin.define({ id: "9router", setup })`, registering providers/models through `ctx.provider.transform(...)` and refreshing via `ctx.provider.reload()`
- Add `src/v2-map.ts` mapping the discovered `ModelConfig` onto V2 `Model.Info` (capabilities, required `limit.context`/`limit.output`, variants)
- Add `src/index.ts` dual entrypoint: default export merges the V2 definition with `server: NineRouterPlugin` (V1 1.18.29+); named `NineRouterPlugin` export retained for older V1
- Package entry (`exports`, `main`, `types`) now points at `dist/index.js` / `dist/index.d.ts`
- `@opencode/plugin@^2.0.12` added as a runtime dependency; `@opencode-ai/plugin` / `@opencode-ai/sdk` kept for V1 types
- V1 behavior unchanged; discovery/capability/cache algorithms untouched

### v0.8.1 — Strict combo enrichment
- Combos count as enriched only on an **exact** models.dev segment match (no more loose substring hits like `vision` → `gpt-4-turbo-vision`)
- Ignore bare `/models/info` capability stubs (`{tools: true}`) for combos, so backends that return stubs still get forced multimodal defaults

### v0.8.0 — Combo multimodal defaults
- Detect combo models via `owned_by: "combo"` (fallback: no provider prefix)
- Force multimodal defaults on combos with no resolved capability info: text/image/audio input, tool calling, reasoning, 256K context, 128K output
- Add `low`/`medium`/`high`/`xhigh`/`max`/`minimal`/`thinking` variants, plus `search: false`, `context_length`, and `max_completion_tokens`
- Version discovery cache so older entries are refetched

### v0.7.1 — Discovery logging
- Add INFO-level logging for cache hit/miss, fetch status, timeout, and stale fallback

### v0.7.0 — Caching & timeout
- **Model discovery cache** — 3-hour TTL with stale fallback when backend is unreachable
- **Configurable timeout** — 30s default, adjustable via `discoveryTimeout` option
- **Provider options** — `cache`, `cacheTTL`, `discoveryTimeout`
- New constant: `DISCOVERY_CACHE_TTL`, `DISCOVERY_TIMEOUT`

### v0.6.0 — Multi-provider & fallback
- Support multiple 9Router-family providers (`9router`, `9router-local`, etc.)
- Fallback models catalog via `models.dev` API
- Per-model capability resolution (vision, tools, reasoning)

### v0.5.x — Initial releases
- Basic auto-discovery from `localhost:20128`
- Fallback models when API unreachable
- Single provider support

## Development

```bash
git clone https://github.com/vheins/opencode-9router
cd opencode-9router
npm install
npm run build
```

### Test

```bash
node test-minimal.mjs
opencode models 9router --print-logs
```

### Validate after publish

After publishing to npm, verify the plugin works end-to-end:

```bash
opencode models 9router-local --print-logs --log-level DEBUG
```

This runs model discovery against the published package with full debug logging to confirm caching, timeout, and capability resolution are working correctly.

### Publish

```bash
npm login
npm version patch  # or minor, major
npm publish --access public
git push --follow-tags
```

## Files

```
opencode-9router/
  src/
    index.ts          # Dual V1 + V2 package entry
    plugin.ts         # V1 plugin entry (provider registration + config hook)
    v2.ts             # V2 plugin entry (Plugin.define + provider transform)
    v2-map.ts         # V1 ModelConfig → V2 Model.Info mapping
    discovery.ts      # Model discovery pipeline
    capabilities.ts   # Capability resolution (catalog + per-model API)
    cache.ts          # Discovery + models.dev cache
    types.ts          # Shared types
    utils.ts          # Shared helpers
    constants.ts      # Models, defaults, prefixes
  dist/               # Compiled output (generated)
  package.json        # npm package config
  tsconfig.json       # TypeScript config
  README.md           # This file
  README.id.md        # Bahasa Indonesia version
  LICENSE             # MIT
```

## Links

- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins/)
- [OpenCode Custom Provider](https://opencode.ai/docs/providers/#custom-provider)
- [9Router GitHub](https://github.com/decolua/9router)
- [9Router Website](https://9router.com)
