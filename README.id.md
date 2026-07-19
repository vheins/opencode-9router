# @vheins/opencode-9router

Plugin provider OpenCode untuk [9Router](https://github.com/decolua/9router) — Router AI & Penghemat Token GRATIS. 40+ provider, 100+ model.

Mendaftarkan 9Router sebagai custom provider di OpenCode dengan auto-discovery model.

## Mulai Cepat

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@latest"]
}
```

1. Tambahkan plugin ke `opencode.json`
2. Restart OpenCode
3. `/models` → pilih model 9Router

Plugin akan otomatis mendeteksi model dari `http://localhost:20128` (default).

## Fitur

- **Auto-discover model** — Model dari 9Router terdeteksi otomatis saat startup
- **Cache cerdas** — Hasil discovery di-cache 3 jam (bisa diatur) untuk startup instan berikutnya
- **Stale fallback** — Jika backend tidak terjangkau, tetap pakai model dari cache
- **Timeout bisa diatur** — Timeout discovery default 30 detik, bisa disesuaikan untuk backend lambat
- **Daftar model dinamis** — Semua model dari 9Router tersedia, termasuk combo kustom
- **Kompatibel dengan OpenAI** — Menggunakan `@ai-sdk/openai-compatible`
- **Type-safe** — Menggunakan hook `config` untuk registrasi provider yang sesuai dengan skema konfigurasi OpenCode

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

Setiap key provider harus diawali `9router`. `npm` harus `@ai-sdk/openai-compatible`. `name` adalah label yang tampil di OpenCode.

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
        "baseURL": "https://model.idsolutions.id/v1",
        "apiKey": "sk-...",
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
    plugin.ts         # Logika plugin utama
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
