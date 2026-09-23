/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Runs in the main process: full Node.js access. Exposed to the plugin
// renderer as VencordNative.pluginHelpers.DiscordStyler.<fn>(...).
// Only used when the "fileSync" setting is on (desktop only).

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

async function findTheme(fileName: string): Promise<string> {
    const safe = path.basename(fileName);
    for (const dir of themesDirs()) {
        const full = path.join(dir, safe);
        try {
            await fs.access(full);
            return full;
        } catch { /* try next */ }
    }
    throw new Error(`Theme file not found in any Vencord/Vesktop themes folder: ${safe}`);
}

export async function listThemes(_: IpcMainInvokeEvent): Promise<string[]> {
    const out: string[] = [];
    for (const dir of themesDirs()) {
        try {
            for (const f of await fs.readdir(dir)) {
                if (f.toLowerCase().endsWith(".css")) out.push(f);
            }
        } catch { /* folder may not exist */ }
    }
    return [...new Set(out)].sort();
}

export async function readTheme(_: IpcMainInvokeEvent, fileName: string): Promise<string> {
    return fs.readFile(await findTheme(fileName), "utf-8");
}

/** Insert or replace the managed block, timestamped backup alongside. Returns backup name. */
export async function writeManagedBlock(
    _: IpcMainInvokeEvent,
    fileName: string,
    start: string,
    end: string,
    block: string,
): Promise<string> {
    const full = await findTheme(fileName);
    const text = await fs.readFile(full, "utf-8");
    const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
    const backup = `${full}.bak.${stamp}`;
    await fs.writeFile(backup, text, "utf-8");

    let next: string;
    if (text.includes(start) && text.includes(end)) {
        next = text.split(start)[0] + block + text.split(end)[1];
    } else {
        next = (text.endsWith("\n") ? text : text + "\n") + "\n" + block + "\n";
    }
    await fs.writeFile(full, next, "utf-8");
    return path.basename(backup);
}
