# BetterVencord — stock Vencord source + exclusive plugins

This folder is a snapshot of upstream Vencord
(`https://github.com/Vendicated/Vencord`, main @ Sep 2026, v1.15.6)
plus our plugins in `src/userplugins/` (10 folders — that IS the
canonical source, edit them in place) and small hardening fixes in
`src/plugins/reviewDB/` (fail-soft rendering so Discord updates degrade
to notices instead of crashes; see `src/userplugins/betterHealth/`).

- No other Vencord core files are modified. No fork behavior, no rebrand.
- The exclusive plugins live in `src/userplugins/` (10 folders — that IS the
  canonical source, edit them in place).
- Release builds MUST be standalone with the fork remote so the in-app
  updater tracks our releases (see `installer/README.md`):
  `VENCORD_REMOTE=ThinuxBOOM/BetterVencord pnpm build --standalone`.
- `node_modules/`, `dist/`, and `.git` are intentionally NOT committed.
  Recreate locally: `pnpm install && pnpm build`.

## Build + inject (Windows)

```bash
cd BetterVencord
pnpm install
pnpm build
pnpm inject   # patch Discord Stable, then enable DiscordStyler in Settings > Plugins
```

Checks that were green on this snapshot: `tsc --noEmit`, `eslint` on the
plugin files, `pnpm build` exit 0, plugin + native methods confirmed in
`dist/vencordDesktopRenderer.js` and `dist/vencordDesktopMain.js`.

Keep Vencord auto-update off while running this build, or an official
update will replace it (and drop the plugin).
