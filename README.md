# @vheins/opencode-9router

OpenCode plugin provider for [9Router](https://github.com/decolua/9router) — FREE AI Router & Token Saver. 40+ providers, 100+ models.

Mendaftarkan 9Router sebagai custom provider di OpenCode dengan auto-discovery models dan konfigurasi baseURL via `/connect`.

## Quick Start

```json
{
  "plugin": ["@vheins/opencode-9router"]
}
```

1. Tambahkan plugin ke `opencode.json`
2. Restart OpenCode
3. `/connect` → pilih **Connect to 9Router**
4. Masukkan Base URL (default: `http://localhost:20128`) dan API Key
5. `/models` → pilih model 9Router

## Features

- **Auto-discover models** — Models dari 9Router otomatis terdeteksi saat startup
- **Configurable baseURL** — Atur Base URL langsung dari `/connect`, bukan dari opencode.json
- **Dynamic model list** — Semua model dari 9Router tersedia, termasuk combo kustom
- **27+ fallback models** — Well-known models tersedia jika 9Router belum running
- **OpenAI-compatible** — Menggunakan `@ai-sdk/openai-compatible`

## Installation

### From npm (recommended)

```json
{
  "plugin": ["@vheins/opencode-9router"]
}
```

### Local file

```bash
cp src/plugin.ts .opencode/plugins/9router-provider.ts
```

## Usage

### 1. Connect via `/connect`

```
/connect
  → Select: Connect to 9Router
  → Base URL: http://localhost:20128  (customize if needed)
  → API Key: [paste from 9Router Dashboard → Endpoints]
```

### 2. Select model

```
/models
  → Find 9Router provider
  → Pick any model (e.g., kr/claude-sonnet-4.5, cc/claude-opus-4-7)
```

### Custom Base URL

Jika 9Router berjalan di host/port berbeda, masukkan URL saat `/connect`:

```
Base URL: http://192.168.1.100:20128
```

Atau via plugin options:

```json
{
  "plugin": [
    ["@vheins/opencode-9router", { "baseURL": "http://192.168.1.100:20128" }]
  ]
}
```

Atau via environment variable:

```bash
export ROUTER_BASE_URL=http://192.168.1.100:20128
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
opencode.json "plugin": ["@vheins/opencode-9router"]
  ↓
Bun installs package from npm
  ↓
Plugin loads at startup:
  1. Try GET /v1/models from 9Router (3s timeout)
  2. If OK → register live models
  3. If fail → register 27 fallback models
  ↓
Provider "9router" appears in /models
  ↓
User runs /connect → enters baseURL + API key
  ↓
Auth loader overrides provider config with user's baseURL
```

## Development

```bash
git clone https://github.com/vheins/opencode-9router
cd opencode-9router
bun install
```

### Publish

```bash
npm login
npm publish --access public
```

## Files

```
opencode-9router/
  index.ts            # Re-exports
  src/
    plugin.ts         # Main plugin logic
    constants.ts      # Models, defaults, prefixes
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
