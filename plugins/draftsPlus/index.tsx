/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

/*
 * DraftsPlus - every message you send is stashed into a per-channel
 * history (latest 30 each). Need that long explanation back? Copy it
 * from the panel instead of retyping it.
 */

const DRAFTS_KEY = "sentDrafts";
const PER_CHANNEL = 30;

interface Draft {
    channelId: string;
    content: string;
    at: number;
}

async function readAll(): Promise<Draft[]> {
    try {
        return ((await DataStore.get(DRAFTS_KEY)) as Draft[] | undefined) ?? [];
    } catch {
        return [];
    }
}

const settings = definePluginSettings({
    keepCount: {
        type: OptionType.NUMBER,
        description: "Messages remembered per channel",
        default: PER_CHANNEL,
    },
    panel: {
        type: OptionType.COMPONENT,
        component: DraftsPanel,
    },
});

function timeAgo(at: number): string {
    const s = Math.floor((Date.now() - at) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

function DraftsPanel() {
    const [drafts, setDrafts] = React.useState<Draft[]>([]);
    const [filter, setFilter] = React.useState("");
    const [copied, setCopied] = React.useState("");

    React.useEffect(() => {
        readAll().then(setDrafts);
    }, []);

    async function copy(d: Draft) {
        try {
            await navigator.clipboard.writeText(d.content);
            setCopied(`${d.channelId.slice(-4)} · ${timeAgo(d.at)}`);
            setTimeout(() => setCopied(""), 2000);
        } catch {
            setCopied("Copy failed (clipboard blocked).");
        }
    }

    async function remove(at: number, channelId: string) {
        const next = (await readAll()).filter(d => !(d.at === at && d.channelId === channelId));
        await DataStore.set(DRAFTS_KEY, next);
        setDrafts(next);
    }

    async function clear() {
        await DataStore.set(DRAFTS_KEY, []);
        setDrafts([]);
    }

    const shown = drafts
        .filter(d => !filter || d.content.toLowerCase().includes(filter.toLowerCase()))
        .slice(0, 60);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="text" placeholder="Filter drafts…" value={filter} onChange={e => setFilter(e.target.value)} />
            <div style={{ fontSize: 12, opacity: 0.85 }}>
                {drafts.length === 0 ? "Nothing saved yet — send a message and it lands here." : `${drafts.length} remembered. ${copied ? `Copied ${copied}!` : "Copy, then paste back into chat."}`}
            </div>
            {shown.map(d => (
                <div key={`${d.channelId}-${d.at}`} style={{ border: "1px solid var(--background-modifier-accent)", borderRadius: 8, padding: 6, fontSize: 12 }}>
                    <div style={{ opacity: 0.7, marginBottom: 4 }}>#{d.channelId.slice(-6)} · {timeAgo(d.at)}</div>
                    <div style={{ maxHeight: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "pre-wrap" }}>{d.content.slice(0, 220)}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button onClick={() => copy(d)}>Copy</button>
                        <button onClick={() => remove(d.at, d.channelId)}>Delete</button>
                    </div>
                </div>
            ))}
            {drafts.length > 0 && <button onClick={clear}>Forget everything</button>}
        </div>
    );
}

export default definePlugin({
    name: "DraftsPlus",
    description: "Remembers every message you send (per channel) so you can copy any of them back.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Utility", "Chat"],
    requiresRestart: false,
    settings,

    async onBeforeMessageSend(channelId: string, messageObj: { content: string; }) {
        try {
            const content = (messageObj?.content || "").trim();
            if (!content) return;
            const keep = Math.max(5, Math.min(100, Number(settings.store.keepCount) || PER_CHANNEL));
            const all = await readAll();
            const mine = all.filter(d => d.channelId === channelId);
            const rest = all.filter(d => d.channelId !== channelId);
            mine.unshift({ channelId, content, at: Date.now() });
            await DataStore.set(DRAFTS_KEY, [...mine.slice(0, keep), ...rest].slice(0, keep * 10));
        } catch { /* never block sending */ }
    },
});
