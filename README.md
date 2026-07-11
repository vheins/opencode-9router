# @vheins/opencode-9router

OpenCode plugin provider for [9Router](https://github.com/decolua/9router) — FREE AI Router & Token Saver. 40+ providers, 100+ models.

Registers 9Router as a custom provider in OpenCode with auto-discovery of models.

## Quick Start

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"]
}
```

1. Add the plugin to `opencode.json`
2. Restart OpenCode
3. `/models` → select a 9Router model

The plugin will auto-discover models from `http://localhost:20128` (default).

## Features

- **Auto-discover models** — Models from 9Router are automatically detected on startup
- **Smart caching** — Discovery results cached for 3 hours (configurable) for instant subsequent loads
- **Stale fallback** — If the backend is unreachable, returns cached models instead of failing
- **Configurable timeout** — Adjustable discovery timeout (default 30s) for slow backends
- **Dynamic model list** — All models from 9Router are available, including custom combos
- **OpenAI-compatible** — Uses `@ai-sdk/openai-compatible`
- **Type-safe** — Uses the `config` hook for provider registration that conforms to the OpenCode config schema

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
      "name": "ID Solutions",
      "options": {
        "baseURL": "https://model.idsolutions.id/v1",
        "apiKey": "sk-70c801f54ddaab6e-pbot5n-2002c5b3",
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
        "baseURL": "https://model.idsolutions.id/v1",
        "apiKey": "sk-...",
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
    plugin.ts         # Main plugin logic
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
