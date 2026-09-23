# BetterVencord

Stock Vencord, plus 9 exclusive plugins you won't find upstream — republished
as one package. Install in two clicks, no terminal, no build tools.

## The 9 plugins

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

## Install (users)

Download `BetterVencord-Setup.exe` from the latest **Release**, run it, tick
your Discord install, Install, launch Discord, enable plugins in Settings.
Isolated data folder (`%APPDATA%\BetterVencord`) — official Vencord, if any,
is left untouched. Existing themes are copied over on first install.

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
Release page, don't commit).

Verified on this snapshot: `tsc --noEmit` clean, `eslint` clean,
`pnpm build` exit 0, all 9 plugins + natives confirmed in the bundles.
