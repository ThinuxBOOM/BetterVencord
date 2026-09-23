/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

/*
 * SettingsVault - one-file backup and restore for your whole Vencord
 * setup: settings (incl. every plugin's state), QuickCSS, and all theme
 * files. Moving PCs or recovering from a bad experiment stops hurting.
 * Theme files restore through the desktop file bridge (needs this
 * plugin's native.ts); on web they restore via the built-in uploader.
 */

declare const VencordNative: any;

const settings = definePluginSettings({
    panel: {
        type: OptionType.COMPONENT,
        component: VaultPanel,
    },
});

interface Vault {
    version: 1;
    exportedAt: string;
    settings: any;
    quickCss: string;
    themes: { name: string; css: string; }[];
}

function download(name: string, text: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function collectThemes(): Promise<{ name: string; css: string; }[]> {
    const out: { name: string; css: string; }[] = [];
    try {
        const list = (await VencordNative.themes.getThemesList()) as { name?: string; filename?: string; }[];
        for (const t of list) {
            const name = String(t?.filename || t?.name || "");
            if (!name) continue;
            try {
                const css = String(await VencordNative.themes.getThemeData(name));
                out.push({ name, css });
            } catch { /* skip unreadable theme */ }
        }
    } catch { /* themes API unavailable */ }
    return out;
}

function VaultPanel() {
    const [status, setStatus] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function exportAll() {
        if (busy) return;
        setBusy(true);
        setStatus("Collecting…");
        try {
            const vault: Vault = {
                version: 1,
                exportedAt: new Date().toISOString(),
                settings: await VencordNative.settings.get(),
                quickCss: await VencordNative.quickCss.get(),
                themes: await collectThemes(),
            };
            download(`vencord-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(vault));
            const parts = [vault.themes.length + " theme(s)", vault.quickCss ? "QuickCSS" : "no QuickCSS"];
            setStatus(`Exported settings + ${parts.join(", ")}.`);
        } catch (e) {
            setStatus(`Export failed: ${e instanceof Error ? e.message : e}.`);
        } finally {
            setBusy(false);
        }
    }

    async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || busy) return;
        setBusy(true);
        setStatus("Restoring…");
        try {
            const vault = JSON.parse(await file.text()) as Vault;
            if (!vault || vault.version !== 1 || typeof vault.settings !== "object") {
                throw new Error("That file is not a SettingsVault backup.");
            }
            if (!window.confirm("Overwrite current settings, QuickCSS and theme files with this backup?")) {
                setStatus("Cancelled.");
                return;
            }
            await VencordNative.settings.set(vault.settings);
            await VencordNative.quickCss.set(vault.quickCss || "");
            let restored = 0;
            for (const t of vault.themes || []) {
                try {
                    await VencordNative.themes.uploadTheme(t.name, t.css);
                    restored++;
                } catch {
                    try {
                        await VencordNative.pluginHelpers.SettingsVault.writeThemeFile(t.name, t.css);
                        restored++;
                    } catch { /* report below */ }
                }
            }
            setStatus(`Restored settings + QuickCSS + ${restored}/${(vault.themes || []).length} themes. Restart Discord (Ctrl+R) to see everything.`);
        } catch (e) {
            setStatus(`Import failed: ${e instanceof Error ? e.message : e}.`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={exportAll} disabled={busy}>Export backup</button>
                <label style={{ fontSize: 12, border: "1px solid var(--background-modifier-accent)", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
                    Import backup…
                    <input type="file" accept="application/json" onChange={importFile} style={{ display: "none" }} />
                </label>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{status || "One file holds settings, QuickCSS and themes."}</div>
        </div>
    );
}

export default definePlugin({
    name: "SettingsVault",
    description: "One-file backup and restore for settings, QuickCSS and theme files.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Utility"],
    requiresRestart: false,
    settings,
});
