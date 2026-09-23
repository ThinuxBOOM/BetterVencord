# BetterVencord — stock Vencord source + DiscordStyler plugin

This folder is a snapshot of upstream Vencord
(`https://github.com/Vendicated/Vencord`, main @ Sep 2026, v1.15.4)
with exactly one addition: `src/userplugins/discordStyler/` (our plugin).

- No Vencord core files are modified. No fork behavior, no rebrand.
- The canonical plugin source lives at `../../vencord-plugin/`. Before
  building, sync it here:
  `cp ../../vencord-plugin/discordStyler/* src/userplugins/discordStyler/`
  (both copies are identical as of this commit — verify with hashes).
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
