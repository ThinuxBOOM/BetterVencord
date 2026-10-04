# installer/ — BetterVencord Setup source

## Layout

| File | Purpose |
|---|---|
| `installer.py` | The setup app (CustomTkinter if available, plain tkinter fallback) |
| `stub_app.asar` | Pre-packed loader: sets `VENCORD_USER_DATA_DIR` to `%APPDATA%\BetterVencord`, loads `dist\patcher.js`. Packed once with the official `asar` tool — ships byte-identical, no Node needed on user machines |
| `payload/` | **Build-time only, never committed.** Assembled by the release script: fresh `dist/` (no `.map`), `stub_app.asar`, `version.txt` |

## Building the payload (IMPORTANT for auto-update)

The payload **must** be a `--standalone` build with `VENCORD_REMOTE` set to
this fork, otherwise the in-app updater is dead or points at official
Vencord (which would drop the 10 exclusive plugins):

```bash
cd BetterVencord
set VENCORD_REMOTE=ThinuxBOOM/BetterVencord
pnpm install
pnpm build --standalone
# assemble payload/: fresh dist/ (drop *.map), stub_app.asar, version.txt
```

Why: plain `pnpm build` bakes in the **git updater**, which needs a source
checkout + git + build tools on the user's machine — installer users have
none of those, so update checks fail silently. `--standalone` bakes in the
**HTTP updater**, which pulls `patcher.js`/`preload.js`/`renderer.js`/
`renderer.css` from this repo's GitHub Releases (`/releases/latest`).
The installer leaves `autoUpdate` + `autoUpdateNotification` ON so users
self-update from our releases, plugins included.

Release title must end with the short commit hash (the updater parses
`name.slice(name.lastIndexOf(" ") + 1)` as the hash, e.g.
`BetterVencord v1.1.0 <shorthash>`). The `bettervencord-release.yml`
workflow does all of this automatically — prefer it over manual builds.

One thing the updater can never survive: a **Discord client update** that
replaces `app.asar` wipes the loader stub. Users then re-run the Setup
(Repair/Install, 30 seconds) — `BetterHealth` tells them when that happens.

## Dev run

```bash
# point at any built dist:
set BETTERVENCORD_PAYLOAD=C:\path\to\vencord-build\dist\..
python installer/installer.py
```

(`payload/` layout expected: `payload/dist/*`, `payload/stub_app.asar`, `payload/version.txt`.)

## Building the release exe

```bash
pip install pyinstaller customtkinter
# 1. fresh build in the Vencord checkout, then assemble payload/
# 2. one-file windowed exe with payload embedded:
python -m PyInstaller --noconfirm --onefile --windowed \
  --name BetterVencord-Setup \
  --add-data "installer\payload;payload" \
  installer\installer.py
# 3. move dist/BetterVencord-Setup.exe -> release/, hash it, write notes
```

`release/` is gitignored — upload its contents to the GitHub Release page manually.
