/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Runs in the main process: full Node.js access. Exposed to the plugin
// renderer as VencordNative.pluginHelpers.BetterHealth.<fn>(...).
// Persists crash reports where they can be read without DevTools
// (settings UIs and toasts truncate them), so the next "DISCORD HAS
// CRASHED" is diagnosable instead of a mystery.

import { app, IpcMainInvokeEvent } from "electron";
import { promises as fs } from "fs";
import * as path from "path";

const MAX_LOG_BYTES = 256 * 1024;

function dataDir(): string {
    // The installer stub sets this to %APPDATA%\BetterVencord.
    return process.env.VENCORD_USER_DATA_DIR || app.getPath("userData");
}

/** Append one JSON crash report line. Returns the log file path. */
export async function appendCrashLog(_: IpcMainInvokeEvent, reportJson: string): Promise<string> {
    const dir = path.join(dataDir(), "crashes");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, "crash.log");
    let line = String(reportJson ?? "").slice(0, 32 * 1024);
    if (!line.endsWith("\n")) line += "\n";
    try {
        const stat = await fs.stat(file).catch(() => null);
        if (stat && stat.size > MAX_LOG_BYTES) {
            // Rotate: keep it bounded, never grow without limit.
            await fs.writeFile(file, line, "utf-8");
            return file;
        }
        await fs.appendFile(file, line, "utf-8");
    } catch {
        // Disk issues must never make a crash worse.
        await fs.writeFile(file, line, "utf-8").catch(() => { /* give up quietly */ });
    }
    return file;
}
