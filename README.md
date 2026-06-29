# @vheins/opencode-9router

OpenCode plugin provider for [9Router](https://github.com/decolua/9router) — FREE AI Router & Token Saver. 40+ providers, 100+ models.

Registers 9Router as a custom provider in OpenCode with auto-discovery of models.

## Quick Start

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@0.5.0"]
}
```

1. Add the plugin to `opencode.json`
2. Restart OpenCode
3. `/models` → select a 9Router model

The plugin will auto-discover models from `http://localhost:20128` (default).

## Features

- **Auto-discover models** — Models from 9Router are automatically detected on startup
- **Dynamic model list** — All models from 9Router are available, including custom combos
- **OpenAI-compatible** — Uses `@ai-sdk/openai-compatible`
- **Type-safe** — Uses the `config` hook for provider registration that conforms to the OpenCode config schema

## Installation

### From npm (recommended)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@0.5.0"]
}
```

No need to define a provider manually — the plugin registers it automatically.

### Custom Base URL

If 9Router is running on a different host or port, add a provider config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@0.5.0"],
  "provider": {
    "9router": {
      "options": {
        "baseURL": "https://example.com/v1"
      }
    }
  }
}
```

### With API Key

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@0.5.0"],
  "provider": {
    "9router": {
      "options": {
        "baseURL": "https://example.com/v1",
        "apiKey": "your-api-key-here"
      }
    }
  }
}
```

Or using environment variables:

```json
{
  "provider": {
    "9router": {
      "options": {
        "baseURL": "https://example.com/v1",
        "apiKey": "{env:ROUTER_API_KEY}"
      }
    }
  }
}
```

```bash
export ROUTER_API_KEY=your-api-key-here
opencode
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
opencode.json "plugin": ["@vheins/opencode-9router@0.5.0"]
  ↓
Bun installs the package from npm
  ↓
Plugin loads at startup:
  1. Read baseURL from provider config (or use default http://localhost:20128)
  2. Try GET /v1/models from baseURL (3s timeout)
  3. If OK → register live models
  4. If fail → log warning, no models registered
  ↓
config hook creates/updates provider "9router" with discovered models
  ↓
Provider "9router" appears in /models
```

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
```

### Publish

```bash
npm login
npm publish --access public
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
  LICENSE             # MIT
```

## Links

- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins/)
- [OpenCode Custom Provider](https://opencode.ai/docs/providers/#custom-provider)
- [9Router GitHub](https://github.com/decolua/9router)
- [9Router Website](https://9router.com)
