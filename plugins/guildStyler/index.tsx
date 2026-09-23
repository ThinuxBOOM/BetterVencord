/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { GuildStore, React, SelectedGuildStore } from "@webpack/common";

/*
 * GuildStyler - per-server wallpapers. Each community gets its own vibe;
 * the wallpaper swaps automatically when you switch servers. Any server
 * without a mapping falls back to your global wallpaper (DiscordStyler).
 * No webpack patches: driven by the CHANNEL_SELECT flux event + a CSS var.
 */

const WALLS_KEY = "guildWalls";

interface GuildWall {
    name: string;
    value: string; // data: URI or https:// URL
}

function cssUrl(value: string): string {
    const v = value.trim();
    return v.toLowerCase().startsWith("url(") ? v : `url("${v}")`;
}

async function readWalls(): Promise<Record<string, GuildWall>> {
    try {
        return ((await DataStore.get(WALLS_KEY)) as Record<string, GuildWall> | undefined) ?? {};
    } catch {
        return {};
    }
}

async function applyForGuild(guildId: string | null) {
    try {
        if (!settings.store.enabled || !guildId) {
            document.documentElement.style.removeProperty("--theme-background-image");
            return;
        }
        const walls = await readWalls();
        const hit = walls[guildId];
        if (hit?.value) document.documentElement.style.setProperty("--theme-background-image", cssUrl(hit.value));
        else document.documentElement.style.removeProperty("--theme-background-image");
    } catch {
        /* never break Discord over a wallpaper */
    }
}

function currentGuild(): { id: string | null; name: string; } {
    try {
        const id = SelectedGuildStore.getGuildId();
        if (!id) return { id: null, name: "DMs" };
        let name = "this server";
        try { name = GuildStore.getGuild(id)?.name ?? name; } catch { /* fine */ }
        return { id, name };
    } catch {
        return { id: null, name: "unknown" };
    }
}

function fileToWallpaper(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => {
            const dataUrl = String(reader.result);
            if (file.type === "image/gif" && file.size <= 8 * 1024 * 1024) {
                const probe = new Image();
                probe.onload = () => resolve(dataUrl);
                probe.onerror = () => reject(new Error("Not a readable image."));
                probe.src = dataUrl;
                return;
            }
            const img = new Image();
            img.onload = () => {
                try {
                    const scale = Math.min(1, 1920 / img.width);
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/jpeg", 0.82));
                } catch (e) {
                    reject(e instanceof Error ? e : new Error("Image processing failed."));
                }
            };
            img.onerror = () => reject(new Error("Not a readable image."));
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Swap wallpapers per server",
        default: true,
        onChange: v => {
            if (v) void applyForGuild(currentGuild().id);
            else document.documentElement.style.removeProperty("--theme-background-image");
        },
    },
    walls: {
        type: OptionType.COMPONENT,
        component: GuildWalls,
    },
});

function GuildWalls() {
    const [status, setStatus] = React.useState("");
    const [walls, setWalls] = React.useState<Record<string, GuildWall>>({});
    const [busy, setBusy] = React.useState(false);
    let guild = { id: null as string | null, name: "unknown" };
    try {
        guild = currentGuild();
    } catch { /* SSR-safe */ }

    React.useEffect(() => {
        readWalls().then(setWalls);
    }, []);

    async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || busy) return;
        if (!guild.id) {
            setStatus("Open a server first (DMs can't have wallpapers).");
            return;
        }
        setBusy(true);
        setStatus("Processing…");
        try {
            const value = await fileToWallpaper(file);
            const next = { ...(await readWalls()), [guild.id]: { name: guild.name, value } };
            await DataStore.set(WALLS_KEY, next);
            setWalls(next);
            await applyForGuild(guild.id);
            setStatus(`Wallpaper set for ${guild.name}.`);
        } catch (err) {
            setStatus(err instanceof Error ? err.message : "Failed.");
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: string) {
        const next = await readWalls();
        delete next[id];
        await DataStore.set(WALLS_KEY, next);
        setWalls(next);
        await applyForGuild(currentGuild().id);
    }

    const entries = Object.entries(walls);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Current: <b>{guild.name}</b></div>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onFile} disabled={busy} />
            <div style={{ fontSize: 12, opacity: 0.85 }}>{status || "Pick an image to pin it to the current server."}</div>
            {entries.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {entries.map(([id, w]) => (
                        <div key={id} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                            <img src={w.value} alt={w.name} title={w.name} style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 8 }} />
                            <span style={{ fontSize: 11, opacity: 0.8 }}>{w.name.slice(0, 18)}</span>
                            <button onClick={() => remove(id)}>Remove</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "GuildStyler",
    description: "Per-server wallpapers: each community gets its own background, swapped automatically. Falls back to your global wallpaper.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Appearance"],
    requiresRestart: false,
    settings,

    flux: {
        CHANNEL_SELECT(e: any) {
            void applyForGuild(e?.guildId ?? currentGuild().id);
        },
    },

    start() {
        void applyForGuild(currentGuild().id);
    },

    stop() {
        document.documentElement.style.removeProperty("--theme-background-image");
    },
});
