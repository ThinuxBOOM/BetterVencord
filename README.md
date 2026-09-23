# DiscordStyler — full appearance studio for Vencord

One-click wallpapers, fonts, and Discord-wide colors, live inside Discord.
No external app, no repos, no pasted URLs, no restarts.

## What it does

- **Wallpapers**: pick an image → compressed → embedded as `data:` URI → live instantly, even offline. Animated GIFs keep animation. Optional **Link via webhook** mode uploads through your own Discord server for a permanent `cdn.discordapp.com` link.
- **Typography**: main / display / code fonts (native Discord vars, theme-agnostic), optional Google Fonts auto-import, font size.
- **Colors**: theme color, Discord accent → full brand scale, message/muted/link/header text, solid backgrounds, channel + unread colors, mention background/bar, scrollbar, online/idle/DND dots, message hover, code blocks, unread divider.
- **Home icon**: custom image + zoom + position.
- **Library + restore**: recent wallpapers cached in `DataStore`, one-click re-apply, pre-session restore.
- **Optional file sync** (desktop): mirrors the managed block into a real `.theme.css` file via `native.ts`.
- **Zero webpack patches** → immune to Discord updates breaking it.

## Install (users)

Grab `BetterVencord-Setup.exe` from the latest **Release**: run it, tick your
Discord install, Install, launch Discord, enable plugins in Settings.
Details + checksums in `release/RELEASE_NOTES.md` (upload folder, not committed).

## Install (developers)

No upstream clone needed — the full Vencord source (plus our plugin) is
already vendored in `BetterVencord/`:

```bash
cd BetterVencord
pnpm install
pnpm build
pnpm inject   # then enable DiscordStyler in Settings > Plugins
```

Set your Discord user id in `authors` (`vencord-plugin/discordStyler/index.tsx`,
synced into `BetterVencord/src/userplugins/`). Keep Vencord auto-update
off while running a custom build, or updates will replace it with official.

## Layout

| Path | Purpose |
|---|---|
| `vencord-plugin/discordStyler/index.tsx` | The flagship plugin (canonical source): full appearance studio |
| `vencord-plugin/discordStyler/native.ts` | Main-process file sync: list/read/write theme files with backups |
| `vencord-plugin/README.md` | Plugin install notes + verification log |
| `plugins/` | 8 more plugins (canonical sources): GuildStyler, SnippetStudio, ChatArchive, ChatStats, DraftsPlus, RemindMe, ServerJanitor, SettingsVault |
| `BetterVencord/` | Stock Vencord v1.15.4 source + all plugins in `src/userplugins/` (see `BetterVencord/DISCORDSTYLER.md`) |

## History

This repo started as an external Python app (`app.py` + helpers) that edited
Vencord theme files from outside Discord. It was fully superseded by the
in-Discord plugin and removed: injection replaces file editing, canvas
replaces Pillow, `DataStore` replaces the `walls/` library, `fetch` replaces
`requests`. The `vencord-plugin/` folder is the entire product.
