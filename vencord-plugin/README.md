# DiscordStyler — Vencord userplugin

One-click wallpapers + full theme controls, inside Discord. No external app.

- **Wallpaper picker**: pick an image → compressed → embedded as `data:` URI → live instantly, even offline. Animated GIFs keep animation.
- **Link via webhook**: same instant apply, then uploads through your Discord webhook for a permanent `cdn.discordapp.com` link (theme stays tiny).
- **Typography**: main/display/code fonts (with optional Google Fonts auto-import), font size.
- **Colors**: theme color, Discord accent → full brand scale (buttons, blurple), message/muted/link/header text, solid backgrounds, channel + unread colors, mention background/bar, scrollbar, online/idle/DND dots, message hover, code blocks, unread divider.
- **Home icon**: custom image + zoom + position.
- **Library + restore**: recent wallpapers cached, one-click re-apply, pre-session restore.
- **Optional file sync** (desktop): mirror the managed block into a real `.theme.css` file via `native.ts`.
- **Zero webpack patches** → nothing breaks on Discord updates, no restart needed.

## Install (custom plugin = build from source, per Vencord docs)

```bash
git clone https://github.com/Vendicated/Vencord
cd Vencord
# create userplugins dir if missing, then copy this folder in:
cp -r /path/to/DiscordStyler/vencord-plugin/discordStyler src/userplugins/discordStyler
pnpm install
pnpm build
# inject (pnpm inject) or restart Discord, then enable DiscordStyler in Settings > Plugins
```

Set your Discord user id in `authors` (`index.tsx`) to your own snowflake.

## Verified

Built inside a real Vencord checkout (Sep 2026): `tsc --noEmit` clean,
`eslint` clean, `pnpm build` exit 0, plugin + native methods confirmed in
`dist/vencordDesktopRenderer.js` and `dist/vencordDesktopMain.js`.

## Layout

| File | Purpose |
|---|---|
| `index.tsx` | Plugin: settings, file→`data:` URI pipeline, managed-style injection, library, webhook upload |
| `native.ts` | Main-process file sync: list/read/write theme files with backups |

## Notes

- Uses a dedicated `<style id="discord-styler-managed">` element (appended after `<head>`, wins specificity ties) instead of the static `managedStyle` field, because the CSS is rebuilt from settings on every change.
- `VencordNative.pluginHelpers.DiscordStyler.*` must match the registered plugin key — verify against the `translate` plugin in your checkout if file-sync calls fail.
- GPL-3.0-or-later (Vencord's license) applies to this folder.
