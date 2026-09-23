/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { GuildStore, React, RestAPI, SelectedGuildStore } from "@webpack/common";

/*
 * ServerJanitor - mod tools the box doesn't ship: inventory every custom
 * emoji and sticker in the current server, delete the dead ones in place,
 * and export the full list as JSON. 403s surface as plain messages, so a
 * missing MANAGE permission fails loudly instead of silently.
 */

const settings = definePluginSettings({
    panel: {
        type: OptionType.COMPONENT,
        component: JanitorPanel,
    },
});

interface Emoji {
    id: string;
    name: string;
    animated?: boolean;
}

interface Sticker {
    id: string;
    name: string;
    description?: string;
}

function currentGuild(): { id: string | null; name: string; } {
    try {
        const id = SelectedGuildStore.getGuildId();
        if (!id) return { id: null, name: "" };
        let name = "this server";
        try { name = GuildStore.getGuild(id)?.name ?? name; } catch { /* fine */ }
        return { id, name };
    } catch {
        return { id: null, name: "" };
    }
}

function download(name: string, text: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function JanitorPanel() {
    const [status, setStatus] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [emojis, setEmojis] = React.useState<Emoji[] | null>(null);
    const [stickers, setStickers] = React.useState<Sticker[] | null>(null);
    const g = currentGuild();

    async function scan() {
        if (busy) return;
        if (!g.id) {
            setStatus("Open a server first.");
            return;
        }
        setBusy(true);
        setStatus("Scanning…");
        try {
            const [er, sr] = await Promise.all([
                RestAPI.get({ url: `/guilds/${g.id}/emojis` }),
                RestAPI.get({ url: `/guilds/${g.id}/stickers` }),
            ]);
            const e = (Array.isArray((er as any).body) ? (er as any).body : []) as Emoji[];
            const s = (Array.isArray((sr as any).body) ? (sr as any).body : []) as Sticker[];
            setEmojis(e);
            setStickers(s);
            setStatus(`${e.length} emojis, ${s.length} stickers in ${g.name}.`);
        } catch (e) {
            setStatus(`Scan failed: ${e instanceof Error ? e.message : e} (need Manage Expressions permission).`);
        } finally {
            setBusy(false);
        }
    }

    async function removeEmoji(id: string, name: string) {
        if (!g.id) return;
        if (!window.confirm(`Delete emoji :${name}:?`)) return;
        try {
            await RestAPI.del({ url: `/guilds/${g.id}/emojis/${id}` });
            setEmojis(prev => (prev ?? []).filter(e => e.id !== id));
            setStatus(`Deleted :${name}:.`);
        } catch (e) {
            setStatus(`Delete failed: ${e instanceof Error ? e.message : e}.`);
        }
    }

    async function removeSticker(id: string, name: string) {
        if (!g.id) return;
        if (!window.confirm(`Delete sticker "${name}"?`)) return;
        try {
            await RestAPI.del({ url: `/guilds/${g.id}/stickers/${id}` });
            setStickers(prev => (prev ?? []).filter(s => s.id !== id));
            setStatus(`Deleted sticker "${name}".`);
        } catch (e) {
            setStatus(`Delete failed: ${e instanceof Error ? e.message : e}.`);
        }
    }

    function exportJson() {
        if (!g.id) return;
        download(`janitor-${g.id.slice(-6)}-${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify({ server: g.name, emojis, stickers }, null, 2));
        setStatus("Inventory exported.");
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Server: <b>{g.name || "open a server first"}</b></div>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={scan} disabled={busy}>Scan expressions</button>
                {(emojis || stickers) && <button onClick={exportJson}>Export JSON</button>}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{status || "Inventory emojis + stickers, delete the dead ones in place."}</div>
            {emojis && (
                <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Emojis ({emojis.length})</div>
                    {emojis.slice(0, 200).map(e => (
                        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                            <span>:{e.name}:{e.animated ? " (gif)" : ""}</span>
                            <button onClick={() => removeEmoji(e.id, e.name)}>Delete</button>
                        </div>
                    ))}
                </div>
            )}
            {stickers && (
                <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Stickers ({stickers.length})</div>
                    {stickers.slice(0, 200).map(s => (
                        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                            <span>{s.name}</span>
                            <button onClick={() => removeSticker(s.id, s.name)}>Delete</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "ServerJanitor",
    description: "Mod tools: inventory server emojis + stickers, delete the dead ones, export as JSON.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Utility", "Organisation"],
    requiresRestart: false,
    settings,
});
