# installer/ — BetterVencord Setup source

## Layout

| File | Purpose |
|---|---|
| `installer.py` | The setup app (CustomTkinter if available, plain tkinter fallback) |
| `stub_app.asar` | Pre-packed loader: sets `VENCORD_USER_DATA_DIR` to `%APPDATA%\BetterVencord`, loads `dist\patcher.js`. Packed once with the official `asar` tool — ships byte-identical, no Node needed on user machines |
| `payload/` | **Build-time only, never committed.** Assembled by the release script: fresh `dist/` (no `.map`), `stub_app.asar`, `version.txt` |

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
