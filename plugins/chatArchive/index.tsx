/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React, RestAPI, SelectedChannelStore } from "@webpack/common";

/*
 * ChatArchive - export the current channel's history to HTML or Markdown.
 * Paginates the official messages endpoint as YOU (same permissions you
 * already have), then downloads a file. No tokens, no external tools.
 */

const settings = definePluginSettings({
    format: {
        type: OptionType.SELECT,
        description: "Export format",
        options: [
            { label: "HTML", value: "html", default: true },
            { label: "Markdown", value: "md" },
        ],
    },
    limit: {
        type: OptionType.NUMBER,
        description: "Max messages per export (cap 5000)",
        default: 500,
    },
    panel: {
        type: OptionType.COMPONENT,
        component: ArchivePanel,
    },
});

interface Msg {
    id: string;
    content: string;
    timestamp: string;
    author?: { username?: string; global_name?: string | null; bot?: boolean; };
    attachments?: { url?: string; filename?: string; }[];
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchHistory(channelId: string, max: number, onProgress: (n: number) => void): Promise<Msg[]> {
    const out: Msg[] = [];
    let before: string | undefined;
    const cap = Math.max(50, Math.min(5000, max || 500));
    try {
        while (out.length < cap) {
            const res = await RestAPI.get({
                url: `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`,
            });
            const page = (Array.isArray((res as any).body) ? (res as any).body : []) as Msg[];
            if (page.length === 0) break;
            out.push(...page);
            onProgress(out.length);
            if (page.length < 100) break;
            before = page[page.length - 1].id;
            await sleep(250);
        }
    } catch (e) {
        if (out.length === 0) throw e instanceof Error ? e : new Error("Export failed.");
        const err = new Error(`Stopped early at ${out.length} messages — saving what we got.`);
        (err as any).partial = out.slice().reverse();
        throw err;
    }
    return out.slice(0, cap).reverse();
}

function toMarkdown(msgs: Msg[]): string {
    return msgs.map(m => {
        const who = m.author?.global_name || m.author?.username || "unknown";
        const when = new Date(m.timestamp).toLocaleString();
        const atts = (m.attachments || []).map(a => `\n![${a.filename || "attachment"}](${a.url})`).join("");
        return `**${who}** _${when}_\n${m.content || ""}${atts}`;
    }).join("\n\n---\n\n");
}

function toHtml(msgs: Msg[], title: string): string {
    const rows = msgs.map(m => {
        const who = esc(m.author?.global_name || m.author?.username || "unknown");
        const when = esc(new Date(m.timestamp).toLocaleString());
        const atts = (m.attachments || []).map(a => `<br><a href="${esc(a.url || "")}">${esc(a.filename || "attachment")}</a>`).join("");
        return `<div class="m"><div class="h"><b>${who}</b> <span>${when}</span></div><div>${esc(m.content || "")}${atts}</div></div>`;
    }).join("\n");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
        "<style>body{font-family:sans-serif;background:#313338;color:#dbdee1;max-width:800px;margin:auto;padding:16px}" +
        ".m{margin-bottom:14px}.h span{color:#949ba4;font-size:12px}a{color:#00a8fc}</style></head>" +
        `<body><h2>${esc(title)} (${msgs.length} messages)</h2>${rows}</body></html>`;
}

function download(name: string, text: string, mime: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function ArchivePanel() {
    const [status, setStatus] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    function save(msgs: Msg[], channelId: string) {
        const fmt = settings.store.format === "md" ? "md" : "html";
        const stamp = new Date().toISOString().slice(0, 10);
        const title = `discord-archive-${channelId.slice(-6)}-${stamp}`;
        download(`${title}.${fmt}`, fmt === "md" ? toMarkdown(msgs) : toHtml(msgs, title), fmt === "md" ? "text/markdown" : "text/html");
        setStatus(`Done — ${msgs.length} messages saved.`);
    }

    async function run() {
        if (busy) return;
        let channelId = "";
        try {
            channelId = SelectedChannelStore.getChannelId();
        } catch {
            setStatus("Open a channel first.");
            return;
        }
        if (!channelId) {
            setStatus("Open a channel first.");
            return;
        }
        setBusy(true);
        setStatus("Exporting… 0");
        try {
            save(await fetchHistory(channelId, Number(settings.store.limit) || 500, n => setStatus(`Exporting… ${n}`)), channelId);
        } catch (e) {
            const partial = (e as any)?.partial as Msg[] | undefined;
            if (partial?.length) save(partial, channelId);
            setStatus(e instanceof Error ? e.message : "Export failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={run} disabled={busy}>Export current channel</button>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{status || "Saves the open channel's history as a file."}</div>
        </div>
    );
}

export default definePlugin({
    name: "ChatArchive",
    description: "Export the current channel's history to HTML or Markdown with one click.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Utility", "Chat"],
    requiresRestart: false,
    settings,
});
