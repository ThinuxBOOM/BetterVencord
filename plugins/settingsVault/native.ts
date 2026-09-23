/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Runs in the main process: full Node.js access. Exposed to the plugin
// renderer as VencordNative.pluginHelpers.SettingsVault.<fn>(...).
// Writes restored theme files (desktop only); the web build uses the
// built-in theme uploader instead.

import { app, IpcMainInvokeEvent } from "electron";
import { promises as fs } from "fs";
import * as path from "path";

function themesDirs(): string[] {
    const appData = app.getPath("appData");
    const home = app.getPath("home");
    return [
        path.join(appData, "BetterVencord", "themes"),
        path.join(appData, "Vencord", "themes"),
        path.join(appData, "Vesktop", "themes"),
        path.join(home, ".config", "Vencord", "themes"),
        path.join(home, ".config", "vesktop", "themes"),
        path.join(home, "Library", "Application Support", "Vencord", "themes"),
        path.join(home, "Library", "Application Support", "Vesktop", "themes"),
    ];
}

/** Write a theme file (timestamped backup first). Returns backup name. */
export async function writeThemeFile(_: IpcMainInvokeEvent, fileName: string, css: string): Promise<string> {
    const safe = path.basename(fileName);
    if (!safe.toLowerCase().endsWith(".css")) throw new Error("Refusing to write a non-CSS theme file.");
    let dir = "";
    for (const d of themesDirs()) {
        try {
            await fs.access(d);
            dir = d;
            break;
        } catch { /* try next */ }
    }
    if (!dir) throw new Error("No Vencord/Vesktop themes folder found.");
    const full = path.join(dir, safe);
    try {
        const prev = await fs.readFile(full, "utf-8");
        const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
        await fs.writeFile(`${full}.bak.${stamp}`, prev, "utf-8");
    } catch { /* no previous version — nothing to back up */ }
    await fs.writeFile(full, css, "utf-8");
    return safe;
}
