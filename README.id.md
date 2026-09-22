# @vheins/opencode-9router

Plugin provider OpenCode untuk [9Router](https://github.com/decolua/9router) — Router AI & Penghemat Token GRATIS. 40+ provider, 100+ model.

Mendaftarkan 9Router sebagai custom provider di OpenCode dengan auto-discovery model.

> **Dukungan Ganda V1 + V2.** Paket ini menyediakan satu entrypoint yang bekerja di **OpenCode V1** (via hook `server` V1, OpenCode `1.18.29`+) maupun **OpenCode V2** (via API `Plugin.define({ id, setup })`). Core discovery dipakai bersama; hanya entrypoint plugin yang berbeda. Tidak perlu paket terpisah.

## Mulai Cepat

### OpenCode V1

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"]
}
```

1. Tambahkan plugin ke `opencode.json`
2. Restart OpenCode
3. `/models` → pilih model 9Router

### OpenCode V2

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@vheins/opencode-9router@latest"]
}
```

Atau dengan opsi plugin (bentuk objek):

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

Plugin akan otomatis mendeteksi model dari `http://localhost:20128` (default).

## Fitur

- **Auto-discover model** — Model dari 9Router terdeteksi otomatis saat startup
- **Cache cerdas** — Hasil discovery di-cache 3 jam (bisa diatur) untuk startup instan berikutnya
- **Stale fallback** — Jika backend tidak terjangkau, tetap pakai model dari cache
- **Timeout bisa diatur** — Timeout discovery default 30 detik, bisa disesuaikan untuk backend lambat
- **Daftar model dinamis** — Semua model dari 9Router tersedia, termasuk combo kustom
- **Default multimodal combo** — Model combo (`owned_by: "combo"`) yang tidak memberikan info kemampuan dipaksa menerima input teks/gambar/audio dengan tool calling, reasoning, konteks 256K, output 128K, dan varian `low`/`medium`/`high`/`xhigh`/`max`/`minimal`/`thinking`
- **Kompatibel dengan OpenAI** — Menggunakan `@ai-sdk/openai-compatible` (V1) / `@opencode/ai/providers/openai-compatible` (V2)
- **Type-safe** — Menggunakan hook `config` (V1) / provider transform (V2) untuk registrasi provider yang sesuai dengan skema konfigurasi OpenCode

## OpenCode V2

OpenCode V2 menggantikan key config `plugin` dengan `plugins` dan bentuk plugin satu-fungsi dengan `Plugin.define({ id, setup })`. Paket ini menangani keduanya — entrypoint yang sama dimuat oleh V1 dan V2.

### Konfigurasi (V2)

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@vheins/opencode-9router@latest"]
}
```

Opsi plugin memakai bentuk objek (`{ "package": ..., "options": { ... } }`) dan dibaca dari `ctx.options`:

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

### Provider (V2)

Di V2, provider dideklarasikan di bawah key `providers`. Setiap provider 9router memakai paket runtime OpenAI-compatible dan menyimpan endpoint di `settings.baseURL`. Plugin mendeteksi model untuk setiap provider yang ID-nya diawali `9router` lalu mengisi daftar model.

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

Jika tidak ada provider 9router, plugin mendaftarkan provider default `9router` menuju `http://localhost:20128`. Refresh latar belakang mendeteksi ulang model dan memanggil `ctx.provider.reload()` setiap 5 menit; interval dibersihkan saat plugin di-unload.

### Entrypoint Ganda V1 + V2

Default export menyediakan kedua implementasi:

```ts
import { Plugin } from "@opencode/plugin"
import { NineRouterPlugin } from "./plugin.js"   // V1
import { nineRouterV2 } from "./v2.js"           // V2

export default { ...Plugin.define(nineRouterV2), server: NineRouterPlugin }
export { NineRouterPlugin }
```

V2 membaca `id`/`setup`; V1 (1.18.29+) membaca `server`. Named export `NineRouterPlugin` dipertahankan untuk V1 lama.

## Instalasi

### Dari npm (disarankan)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"]
}
```

Tidak perlu mendefinisikan provider secara manual — plugin mendaftarkannya secara otomatis.

### Multi Provider

Tambahkan satu atau lebih provider 9Router dengan opsi kustom:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"],
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Provider Anda",
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

Setiap key provider harus diawali `9router`. `npm` harus `@ai-sdk/openai-compatible`. `name` adalah label yang tampil di OpenCode.

> **Jangan pernah commit API key asli.** Ganti `baseURL`/`apiKey` di atas dengan endpoint Anda sendiri dan placeholder seperti `{env:ROUTER_API_KEY}` (atau nilai dummy seperti `sk-...`). Key asli sebaiknya disimpan di environment variable, bukan di `opencode.json` atau README ini.

### Dengan Environment Variable

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

## Opsi Provider

| Opsi                 | Tipe     | Default       | Deskripsi                                            |
| -------------------- | -------- | ------------- | ---------------------------------------------------- |
| `baseURL`              | `string`   | `http://localhost:20128` | Endpoint API 9Router                                 |
| `apiKey`               | `string`   | —             | API key (jika backend membutuhkan)                   |
| `cache`                | `boolean`  | `true`        | Cache hasil discovery ke `~/.cache/opencode-9router/` |
| `cacheTTL`             | `number`   | `10800000` (3j) | Masa berlaku cache dalam milidetik                  |
| `discoveryTimeout`     | `number`   | `30000` (30dtk) | Timeout request `/v1/models` dalam milidetik        |

### Contoh dengan tuning cache dan timeout

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

### Nonaktifkan cache

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

## Penggunaan

### Pilih model

```
/models
  → Cari provider 9Router
  → Pilih model (contoh: kr/claude-sonnet-4.5, cc/claude-opus-4-7)
```

## Prefix Model

| Prefix | Provider | Tingkat |
|--------|----------|---------|
| `cc/` | Claude Code | Berlangganan |
| `cx/` | Codex | Berlangganan |
| `gh/` | GitHub Copilot | Berlangganan |
| `cu/` | Cursor IDE | Berlangganan |
| `kr/` | Kiro AI | **GRATIS** |
| `oc/` | OpenCode Free | **GRATIS** |
| `vertex/` | Vertex AI | Kredit $300 |
| `glm/` | GLM | $0.6/1M |
| `minimax/` | MiniMax | $0.2/1M |
| `kimi/` | Kimi | $9/bulan flat |
| `openrouter/` | OpenRouter | API key |
| `deepseek/` | DeepSeek | API key |
| `groq/` | Groq | API key |

## Cara Kerja

```
opencode.json "plugin": ["@vheins/opencode-9router@latest"]
  ↓
Plugin dimuat saat startup, deteksi provider 9Router-family di config
  ↓
Untuk setiap provider:
  1. Cek cache lokal (~/.cache/opencode-9router/discovery-*.json)
     └─ Cache masih fresh (≤3j) → langsung pakai model dari cache
  2. Jika cache tidak ada atau kedaluwarsa:
     └─ GET {baseURL}/v1/models dengan timeout 30 detik (bisa diatur)
     └─ Jika sukses → daftarkan model + simpan ke cache
     └─ Jika gagal → fallback ke cache lama (jika ada), atau skip
  ↓
Hook config membuat/memperbarui provider dengan model yang ditemukan
  ↓
Provider muncul di /models
```

### Penyimpanan cache

File cache disimpan di `~/.cache/opencode-9router/discovery-{base64url}.json`, satu file per `baseURL` unik. Direktori cache juga menyimpan katalog kemampuan models.dev (`models-dev.json`).

## Catatan Rilis

### v0.9.0 — Dukungan OpenCode V2 (ganda V1 + V2)
- Tambah plugin V2 (`src/v2.ts`) dengan `Plugin.define({ id: "9router", setup })`, mendaftarkan provider/model melalui `ctx.provider.transform(...)` dan refresh via `ctx.provider.reload()`
- Tambah `src/v2-map.ts` yang memetakan `ModelConfig` hasil discovery ke `Model.Info` V2 (capabilities, `limit.context`/`limit.output` wajib, variants)
- Tambah entrypoint ganda `src/index.ts`: default export menggabungkan definisi V2 dengan `server: NineRouterPlugin` (V1 1.18.29+); named export `NineRouterPlugin` dipertahankan untuk V1 lama
- Entry paket (`exports`, `main`, `types`) kini mengarah ke `dist/index.js` / `dist/index.d.ts`
- `@opencode/plugin@^2.0.12` ditambahkan sebagai dependency runtime; `@opencode-ai/plugin` / `@opencode-ai/sdk` dipertahankan untuk tipe V1
- Perilaku V1 tidak berubah; algoritma discovery/capability/cache tidak disentuh

### v0.8.1 — Enrichment combo ketat
- Combo dianggap ter-enrich hanya bila match segmen models.dev **persis** (tidak lagi cocok substring longgar seperti `vision` → `gpt-4-turbo-vision`)
- Abaikan stub kemampuan `/models/info` (`{tools: true}`) untuk combo, sehingga backend yang membalas stub tetap mendapat default multimodal

### v0.8.0 — Default multimodal combo
- Deteksi model combo via `owned_by: "combo"` (fallback: tanpa prefix provider)
- Paksa default multimodal pada combo tanpa info kemampuan: input teks/gambar/audio, tool calling, reasoning, konteks 256K, output 128K
- Tambah varian `low`/`medium`/`high`/`xhigh`/`max`/`minimal`/`thinking`, serta `search: false`, `context_length`, dan `max_completion_tokens`
- Versi cache discovery agar entri lama diambil ulang

### v0.7.1 — Logging discovery
- Log level INFO untuk cache hit/miss, status fetch, timeout, dan stale fallback

### v0.7.0 — Caching & timeout
- **Cache discovery model** — TTL 3 jam dengan stale fallback saat backend tidak terjangkau
- **Timeout dapat diatur** — Default 30 detik, bisa diubah via opsi `discoveryTimeout`
- **Opsi provider baru** — `cache`, `cacheTTL`, `discoveryTimeout`
- Konstanta baru: `DISCOVERY_CACHE_TTL`, `DISCOVERY_TIMEOUT`

### v0.6.0 — Multi-provider & fallback
- Dukungan multiple provider 9Router (`9router`, `9router-local`, dll.)
- Katalog model fallback via API `models.dev`
- Resolusi kemampuan per-model (vision, tools, reasoning)

### v0.5.x — Rilis awal
- Auto-discovery dasar dari `localhost:20128`
- Model cadangan saat API tidak terjangkau
- Dukungan single provider

## Pengembangan

```bash
git clone https://github.com/vheins/opencode-9router
cd opencode-9router
npm install
npm run build
```

### Tes

```bash
node test-minimal.mjs
opencode models 9router --print-logs
```

### Validasi setelah publikasi

Setelah publikasi ke npm, verifikasi plugin bekerja end-to-end:

```bash
opencode models 9router-local --print-logs --log-level DEBUG
```

Perintah ini menjalankan discovery model terhadap paket yang sudah dipublikasikan dengan log level DEBUG penuh untuk memastikan caching, timeout, dan resolusi kemampuan berfungsi dengan benar.

### Publikasi

```bash
npm login
npm version patch  # atau minor, major
npm publish --access public
git push --follow-tags
```

## Berkas

```
opencode-9router/
  src/
    index.ts          # Entry paket ganda V1 + V2
    plugin.ts         # Entry plugin V1 (registrasi provider + config hook)
    v2.ts             # Entry plugin V2 (Plugin.define + provider transform)
    v2-map.ts         # Pemetaan ModelConfig V1 → Model.Info V2
    discovery.ts      # Pipeline discovery model
    capabilities.ts   # Resolusi kapabilitas (katalog + per-model API)
    cache.ts          # Cache discovery + models.dev
    types.ts          # Tipe bersama
    utils.ts          # Helper bersama
    constants.ts      # Model, default, prefix
  dist/               # Hasil kompilasi (dihasilkan)
  package.json        # Konfigurasi paket npm
  tsconfig.json       # Konfigurasi TypeScript
  README.md           # Versi Bahasa Inggris
  README.id.md        # Berkas ini (Bahasa Indonesia)
  LICENSE             # MIT
```

## Tautan

- [Dokumentasi Plugin OpenCode](https://opencode.ai/docs/plugins/)
- [Custom Provider OpenCode](https://opencode.ai/docs/providers/#custom-provider)
- [9Router GitHub](https://github.com/decolua/9router)
- [Situs Web 9Router](https://9router.com)
