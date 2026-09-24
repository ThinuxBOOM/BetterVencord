"""BetterVencord Setup - one-click installer (entry point).

Run from source:  python installer.py
Ships inside BetterVencord-Setup.exe with a payload/ folder (dist + stub).

What Install does (per Discord branch):
  1. app.asar -> _app.asar backup (once; never overwrites an existing backup)
  2. loader stub -> app.asar  (points at %APPDATA%\\BetterVencord\\dist,
     sets VENCORD_USER_DATA_DIR so settings/themes stay isolated)
  3. payload dist files -> %APPDATA%\\BetterVencord\\dist
  4. first run: copies %APPDATA%\\Vencord\\themes -> BetterVencord\\themes
Uninstall restores _app.asar. The data dir is left behind on purpose.
"""

from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import sys
import tkinter as tk
from tkinter import filedialog, messagebox

APP_NAME = "BetterVencord"
DATA_DIRNAME = "BetterVencord"
BRANCHES = [
    ("stable", "Stable", "Discord"),
    ("ptb", "PTB", "DiscordPTB"),
    ("canary", "Canary", "DiscordCanary"),
]


def appdata() -> pathlib.Path:
    return pathlib.Path(os.environ.get("APPDATA", ""))


def localapp() -> pathlib.Path:
    return pathlib.Path(os.environ.get("LOCALAPPDATA", ""))


def payload_dir() -> pathlib.Path:
    """dist + stub + version shipped with the installer."""
    if getattr(sys, "frozen", False):
        return pathlib.Path(sys._MEIPASS) / "payload"  # type: ignore[attr-defined]
    env = os.environ.get("BETTERVENCORD_PAYLOAD")
    if env:
        return pathlib.Path(env)
    return pathlib.Path(__file__).resolve().parent / "payload"


def find_branches() -> list[dict]:
    """Installed Discord branches with their live app.asar (latest app-*)."""
    out = []
    for key, label, folder in BRANCHES:
        base = localapp() / folder
        apps = sorted(base.glob("app-*")) if base.exists() else []
        if not apps:
            continue
        asar = apps[-1] / "resources" / "app.asar"
        out.append({"key": key, "label": label, "base": base, "app_dir": apps[-1], "asar": asar})
    return out


def read_status(branch: dict) -> str:
    """clean | bettervencord | other | missing.

    Loader stubs are <5KB; the real app is MBs. (Vanilla Discord's own
    bundle happens to mention "VencordPatcher", so size gates the check.)
    """
    asar: pathlib.Path = branch["asar"]
    if not asar.exists():
        return "missing"
    try:
        if asar.stat().st_size > 5120:
            return "clean"
        blob = asar.read_bytes()
    except OSError:
        return "missing"
    if b"BetterVencord" in blob:
        return "bettervencord"
    return "other"


def backup_path(branch: dict) -> pathlib.Path:
    return branch["asar"].parent / "_app.asar"


def discord_running() -> bool:
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Discord.exe"],
                             capture_output=True, text=True, timeout=15)
        return "Discord.exe" in (out.stdout or "")
    except (OSError, subprocess.SubprocessError):
        return False


def install(branch: dict, log) -> None:
    payload = payload_dir()
    dist = payload / "dist"
    stub = payload / "stub_app.asar"
    for need in (dist, stub):
        if not need.exists():
            raise FileNotFoundError(f"Installer payload missing: {need}")
    if read_status(branch) == "bettervencord":
        log("Already installed here - use Repair to refresh files.")
        return
    asar: pathlib.Path = branch["asar"]
    bak = backup_path(branch)
    if not bak.exists():
        log(f"Backing up {asar.name} ({asar.stat().st_size // 1024} KB)…")
        shutil.copy2(asar, bak)
    else:
        log("Original backup already present, keeping it.")
    log("Writing BetterVencord loader…")
    shutil.copy2(stub, asar)

    target = appdata() / DATA_DIRNAME / "dist"
    target.mkdir(parents=True, exist_ok=True)
    n = 0
    for src in sorted(dist.iterdir()):
        if src.is_file():
            shutil.copy2(src, target / src.name)
            n += 1
    log(f"Deployed {n} runtime files to %APPDATA%\\{DATA_DIRNAME}\\dist.")

    # first-run kindness: bring existing themes along (never overwrites)
    src_themes = appdata() / "Vencord" / "themes"
    dst_themes = appdata() / DATA_DIRNAME / "themes"
    if src_themes.exists() and not dst_themes.exists():
        shutil.copytree(src_themes, dst_themes)
        log("Migrated your existing themes folder.")
    ver = payload / "version.txt"
    if ver.exists():
        shutil.copy2(ver, appdata() / DATA_DIRNAME / "version.txt")
    lock_auto_update(log)
    log("Done. Launch Discord, then enable plugins in Settings > Plugins.")


def lock_auto_update(log) -> None:
    """Official updates would replace our build and drop the plugins.

    Fresh profiles ship with autoUpdate on, so the installer pins it off
    (merging, never clobbering the rest of the user's settings).
    """
    import json

    settings = appdata() / DATA_DIRNAME / "settings" / "settings.json"
    try:
        data = json.loads(settings.read_text(encoding="utf-8")) if settings.exists() else {}
    except (OSError, ValueError):
        data = {}
    if data.get("autoUpdate") is False:
        return
    data["autoUpdate"] = False
    try:
        settings.parent.mkdir(parents=True, exist_ok=True)
        settings.write_text(json.dumps(data, indent=2), encoding="utf-8")
        log("Pinned auto-update OFF (protects your BetterVencord build).")
    except OSError as exc:
        log(f"Note: couldn't pin auto-update off ({exc}) - toggle it in Settings > Vencord.")


def uninstall(branch: dict, log) -> None:
    if read_status(branch) != "bettervencord":
        log("BetterVencord loader not found here - nothing to remove.")
        return
    bak = backup_path(branch)
    if not bak.exists():
        raise FileNotFoundError("No original backup (_app.asar) - refusing to guess. Use Repair instead.")
    shutil.copy2(bak, branch["asar"])
    log("Original Discord restored. Your BetterVencord data folder was left in place.")


# ------------------------------------------------------------------- UI

class SetupApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        try:
            import customtkinter as ctk
            ctk.set_appearance_mode("dark")
            self.Frame, self.Btn, self.Lbl = ctk.CTkFrame, ctk.CTkButton, ctk.CTkLabel
        except ImportError:
            self.Frame, self.Btn, self.Lbl = tk.Frame, tk.Button, tk.Label
        self.title("BetterVencord Setup")
        self.geometry("560x520")

        try:
            ver = (payload_dir() / "version.txt").read_text(encoding="utf-8").strip()
        except OSError:
            ver = "dev payload"
        self.Lbl(self, text=f"BetterVencord Setup — {ver}").pack(pady=(14, 2))  # type: ignore[attr-defined]
        self.Lbl(self, text="Discord + 9 exclusive plugins. No terminal, no build tools.").pack(pady=(0, 10))  # type: ignore[attr-defined]

        self.rows = self.Frame(self)
        self.rows.pack(fill="x", padx=16)
        self.branch_vars: dict[str, tk.BooleanVar] = {}
        self.custom_branches: list[dict] = []
        for b in find_branches():
            self.add_branch_row(b, default=b["key"] == "stable")
        if not self.branch_vars:
            self.Lbl(self, text="No Discord install found - use Add custom… below.").pack()  # type: ignore[attr-defined]

        btns = self.Frame(self)
        btns.pack(pady=10)
        self.Btn(btns, text="Install", width=100, command=self.on_install).pack(side="left", padx=5)  # type: ignore[attr-defined]
        self.Btn(btns, text="Repair", width=100, command=self.on_repair).pack(side="left", padx=5)  # type: ignore[attr-defined]
        self.Btn(btns, text="Uninstall", width=100, command=self.on_uninstall).pack(side="left", padx=5)  # type: ignore[attr-defined]
        self.Btn(btns, text="Add custom…", width=110, command=self.browse_custom).pack(side="left", padx=5)  # type: ignore[attr-defined]
        self.Btn(btns, text="Launch", width=90, command=self.on_launch).pack(side="left", padx=5)  # type: ignore[attr-defined]

        self.log = tk.Text(self, height=12, bg="#0c0e12", fg="#dcddde", font=("Consolas", 9))
        self.log.pack(fill="both", expand=True, padx=16, pady=(0, 16))
        self.say("Pick a Discord install, then Install. Your original files are backed up automatically.")
        self.refresh_status()

    def say(self, msg: str) -> None:
        self.log.insert(tk.END, msg + "\n")
        self.log.see(tk.END)

    def add_branch_row(self, b: dict, default: bool = False) -> None:
        var = tk.BooleanVar(value=default)
        self.branch_vars[b["key"]] = var
        row = self.Frame(self.rows)
        row.pack(fill="x", pady=3)
        tk.Checkbutton(row, text=f'{b["label"]}  ({b["app_dir"].name})', variable=var).pack(side="left")
        self.Lbl(row, text="").pack(side="right", padx=8)  # type: ignore[attr-defined]
        row.status_label = row.winfo_children()[-1]  # type: ignore[attr-defined]
        row.branch = b  # type: ignore[attr-defined]

    def all_branches(self) -> list[dict]:
        return find_branches() + self.custom_branches

    def chosen(self) -> list[dict]:
        return [b for b in self.all_branches() if self.branch_vars.get(b["key"], tk.BooleanVar(value=False)).get()]

    def refresh_status(self) -> None:
        for row in self.rows.winfo_children():
            st = read_status(row.branch)
            label = {"clean": "not installed", "bettervencord": "✓ installed",
                     "other": "other mod?", "missing": "no app.asar"}.get(st, st)
            row.status_label.config(text=label)

    def need_closed(self) -> bool:
        if discord_running():
            if not messagebox.askyesno("Discord is running",
                                       "Discord must be closed first. Close it now?"):
                return False
            subprocess.run(["taskkill", "/F", "/IM", "Discord.exe"],
                           capture_output=True, timeout=30)
        return True

    def on_install(self) -> None:
        if not self.chosen():
            messagebox.showwarning("Nothing selected", "Tick a Discord install first.")
            return
        if not self.need_closed():
            return
        for b in self.chosen():
            try:
                self.say(f"--- {b['label']} ---")
                install(b, self.say)
            except (OSError, FileNotFoundError) as exc:
                messagebox.showerror("Install failed", f"{b['label']}:\n{exc}")
        self.refresh_status()

    def on_repair(self) -> None:
        for b in self.chosen():
            try:
                self.say(f"--- {b['label']} (repair) ---")
                payload = payload_dir()
                target = appdata() / DATA_DIRNAME / "dist"
                target.mkdir(parents=True, exist_ok=True)
                for src in sorted((payload / "dist").iterdir()):
                    if src.is_file():
                        shutil.copy2(src, target / src.name)
                if read_status(b) != "bettervencord":
                    shutil.copy2(payload / "stub_app.asar", b["asar"])
                self.say("Repaired.")
            except OSError as exc:
                messagebox.showerror("Repair failed", str(exc))
        self.refresh_status()

    def on_uninstall(self) -> None:
        if not self.need_closed():
            return
        for b in self.chosen():
            try:
                self.say(f"--- {b['label']} ---")
                uninstall(b, self.say)
            except (OSError, FileNotFoundError) as exc:
                messagebox.showerror("Uninstall failed", str(exc))
        self.refresh_status()

    def on_launch(self) -> None:
        branches = self.chosen() or self.all_branches()
        if not branches:
            return
        b = branches[0]
        if (b["base"] / "Update.exe").exists():
            cmd = [str(b["base"] / "Update.exe"), "--processStart", "Discord.exe"]
        else:
            exe = next(b["base"].glob("Discord.exe"), None)
            cmd = [str(exe)] if exe else None
            if cmd is None:
                messagebox.showwarning("Can't launch", "No launcher found - start Discord yourself.")
                return
        try:
            subprocess.Popen(cmd)
        except OSError as exc:
            messagebox.showerror("Launch failed", str(exc))

    def browse_custom(self) -> None:
        picked = filedialog.askdirectory(title="Pick Discord install folder (the one with app-*)")
        if not picked:
            return
        base = pathlib.Path(picked)
        apps = sorted([d for d in base.glob("app-*") if (d / "resources" / "app.asar").exists()])
        if not apps:
            messagebox.showwarning("Not a Discord folder",
                                   f"No app-*/resources/app.asar under:\n{picked}")
            return
        key = f"custom-{len(self.custom_branches)}"
        b = {"key": key, "label": f"Custom ({base.name})", "base": base,
             "app_dir": apps[-1], "asar": apps[-1] / "resources" / "app.asar"}
        self.custom_branches.append(b)
        self.add_branch_row(b, default=True)
        self.say(f"Added custom install: {base} ({apps[-1].name}).")
        self.refresh_status()


def main() -> None:
    SetupApp().mainloop()


if __name__ == "__main__":
    main()
