# @vheins/opencode-9router

OpenCode plugin provider for [9Router](https://github.com/decolua/9router) — FREE AI Router & Token Saver. 40+ providers, 100+ models.

Mendaftarkan 9Router sebagai custom provider di OpenCode dengan auto-discovery models.

## Quick Start

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"],
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "9Router",
      "options": {
        "baseURL": "https://model.idsolutions.id/v1"
      }
    }
  }
}
```

1. Tambahkan plugin dan provider ke `opencode.json`
2. Restart OpenCode
3. `/models` → pilih model 9Router

## Features

- **Auto-discover models** — Models dari 9Router otomatis terdeteksi saat startup
- **Dynamic model list** — Semua model dari 9Router tersedia, termasuk combo kustom
- **OpenAI-compatible** — Menggunakan `@ai-sdk/openai-compatible`
- **Type-safe** — Menggunakan `config` hook untuk registrasi provider yang sesuai dengan OpenCode config schema

## Installation

### From npm (recommended)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"],
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "9Router",
      "options": {
        "baseURL": "https://model.idsolutions.id/v1"
      }
    }
  }
}
```

Plugin akan auto-discover models dari baseURL yang dikonfigurasi.

### Local file

```bash
cp src/plugin.ts .opencode/plugins/9router-provider.ts
cp src/constants.ts .opencode/plugins/constants.ts
```

## Usage

### 1. Configure provider

Tambahkan provider `9router` ke `opencode.json` dengan `baseURL` yang sesuai.

### 2. Select model

```
/models
  → Find 9Router provider
  → Pick any model (e.g., kr/claude-sonnet-4.5, cc/claude-opus-4-7)
```

### Custom Base URL

Ubah `baseURL` di provider config sesuai kebutuhan:

```json
{
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "9Router",
      "options": {
        "baseURL": "http://localhost:20128/v1"
      }
    }
  }
}
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
Bun installs package from npm
  ↓
Plugin loads at startup:
  1. Read provider config from opencode.json
  2. Try GET /v1/models from baseURL (3s timeout)
  3. If OK → register live models
  4. If fail → log error, no models registered
  ↓
config hook updates provider with discovered models
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
