# BetterVencord plugin suite (canonical sources)

Each folder is one self-contained Vencord userplugin (`index.tsx`, plus
`native.ts` where noted). Copy/sync into
`BetterVencord/src/userplugins/` before `pnpm build`.

| Plugin | What it does |
|---|---|
| `guildStyler` | Per-server wallpapers, auto-swapped on server switch |
| `snippetStudio` | Toggleable UI cleanups + custom CSS box |
| `chatArchive` | One-click channel export to HTML/Markdown |
| `chatStats` | Local-only channel analytics |
| `draftsPlus` | Per-channel sent-message history with copy-back |
| `remindMe` | Right-click → remind-me-later toasts, survives restarts |
| `serverJanitor` | Emoji/sticker inventory, in-place delete, JSON export |
| `settingsVault` | One-file backup/restore (`native.ts` for theme files) |

The flagship full-appearance studio lives separately in
`../vencord-plugin/discordStyler/`.

Conventions: no webpack patches, no module-eval side effects (a load-time
throw once took down the whole plugin system — see DiscordStyler history),
all external store access guarded, `requiresRestart: false`.
