# @vheins/opencode-9router

Plugin provider OpenCode untuk [9Router](https://github.com/decolua/9router) — Router AI & Penghemat Token GRATIS. 40+ provider, 100+ model.

Mendaftarkan 9Router sebagai custom provider di OpenCode dengan auto-discovery model.

## Mulai Cepat

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@0.6.0"]
}
```

1. Tambahkan plugin ke `opencode.json`
2. Restart OpenCode
3. `/models` → pilih model 9Router

Plugin akan otomatis mendeteksi model dari `http://localhost:20128` (default).

## Fitur

- **Auto-discover model** — Model dari 9Router terdeteksi otomatis saat startup
- **Daftar model dinamis** — Semua model dari 9Router tersedia, termasuk combo kustom
- **Kompatibel dengan OpenAI** — Menggunakan `@ai-sdk/openai-compatible`
- **Type-safe** — Menggunakan hook `config` untuk registrasi provider yang sesuai dengan skema konfigurasi OpenCode

## Instalasi

### Dari npm (disarankan)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@0.6.0"]
}
```

Tidak perlu mendefinisikan provider secara manual — plugin mendaftarkannya secara otomatis.

### Base URL Kustom

Jika 9Router berjalan di host atau port yang berbeda, tambahkan konfigurasi provider:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@0.6.0"],
  "provider": {
    "9router": {
      "options": {
        "baseURL": "https://example.com/v1"
      }
    }
  }
}
```

### Dengan API Key

> **Membutuhkan v0.6.0+** — Versi sebelumnya tidak mengirimkan API key saat penemuan model, yang menyebabkan error 401 jika instansi 9Router Anda memerlukan autentikasi.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vheins/opencode-9router@0.6.0"],
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

Atau gunakan environment variable:

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
opencode.json "plugin": ["@vheins/opencode-9router@0.6.0"]
  ↓
Bun menginstal paket dari npm
  ↓
Plugin dimuat saat startup:
  1. Baca baseURL dan apiKey dari konfigurasi provider (atau gunakan default)
  2. Coba GET /v1/models dari baseURL (timeout 3 detik, dengan header auth jika apiKey tersedia)
  3. Jika berhasil → daftarkan model langsung
  4. Jika gagal → log peringatan, tidak ada model yang didaftarkan
  ↓
Hook config membuat/memperbarui provider "9router" dengan model yang ditemukan
  ↓
Provider "9router" muncul di /models
```

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
```

### Publikasi

```bash
npm login
npm publish --access public
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
  README.md           # Berkas ini (Inggris)
  README.id.md        # Versi Bahasa Indonesia
  LICENSE             # MIT
```

## Tautan

- [Dokumentasi Plugin OpenCode](https://opencode.ai/docs/plugins/)
- [Custom Provider OpenCode](https://opencode.ai/docs/providers/#custom-provider)
- [9Router GitHub](https://github.com/decolua/9router)
- [Situs Web 9Router](https://9router.com)
