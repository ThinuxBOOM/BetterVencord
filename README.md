# BetterVencord

Stock Vencord, plus 10 exclusive plugins you won't find upstream — republished
as one package. Install in two clicks, no terminal, no build tools.

## The 10 plugins

| Plugin | What it does |
|---|---|
| **DiscordStyler** | Full appearance studio: instant wallpapers, fonts + Google Fonts import, accent/brand scale, text/channel/mention/scrollbar/status colors, home icon, transparency controls |
| **GuildStyler** | Per-server wallpapers, auto-swapped on server switch |
| **SnippetStudio** | Toggleable UI cleanups + your own custom CSS box |
| **ChatArchive** | One-click channel export to HTML/Markdown |
| **ChatStats** | Local-only channel analytics |
| **DraftsPlus** | Per-channel sent-message history with copy-back |
| **RemindMe** | Right-click any message → remind-me-later toasts, survives restarts |
| **ServerJanitor** | Emoji/sticker inventory, in-place delete, JSON export |
| **SettingsVault** | One-file backup/restore of settings, QuickCSS and themes |
| **BetterHealth** | Future-proofing monitor: warns when Discord outruns BetterVencord, surfaces updates, shows patch health |

## Install (users)

Download `BetterVencord-Setup.exe` from the latest **Release**, run it, tick
your Discord install, Install, launch Discord, enable plugins in Settings.
Isolated data folder (`%APPDATA%\BetterVencord`) — official Vencord, if any,
is left untouched. Existing themes are copied over on first install.

Auto-update stays **ON** and tracks this repo's releases (plugins included),
so Discord updates can't silently rot your build. If a Discord client update
wipes the loader (`app.asar` replaced), just re-run the Setup (Repair).

## Build from source (developers)

```bash
cd BetterVencord
pnpm install
pnpm build
pnpm inject
```

Plugin sources live in `BetterVencord/src/userplugins/`. The installer source
and release tooling live in `installer/` (see `installer/README.md`).
`release/` holds the staged v1 artifacts (gitignored — attach to the GitHub
Release page, don't commit). Releases are now automated: push a `bv*` tag
and `.github/workflows/bettervencord-release.yml` builds the standalone
payload + Setup exe and publishes them (the in-app updater tracks those
releases — keep autoUpdate ON).

Verified on this snapshot: `tsc --noEmit` clean, `eslint` clean,
`pnpm build` exit 0, all 10 plugins + natives confirmed in the bundles.
