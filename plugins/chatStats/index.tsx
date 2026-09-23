/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React, RestAPI, SelectedChannelStore } from "@webpack/common";

/*
 * ChatStats - personal channel analytics, computed locally from your own
 * readable history. Messages per day, top authors, top words, attachments.
 * Nothing leaves your machine.
 */

const settings = definePluginSettings({
    scanLimit: {
        type: OptionType.NUMBER,
        description: "Max messages to scan (cap 3000)",
        default: 1000,
    },
    panel: {
        type: OptionType.COMPONENT,
        component: StatsPanel,
    },
});

interface Msg {
    id: string;
    content: string;
    timestamp: string;
    author?: { username?: string; global_name?: string | null; bot?: boolean; };
    attachments?: unknown[];
}

const STOP = new Set(("the,and,you,that,for,with,have,this,from,they,say,her,she,will,one,all,would,there,their,what,about,which,when,make,like,just,look,more,these,than,into,your,has,its,our,out,are,was,were,been,can,who,not,but,had,has,have,does,did,will,no,yes,ok,yeah,lol,lmao,bruh,https,http,www,com,discord,tenor,giphy,gif,emoji").split(","));

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

interface Report {
    total: number;
    mine: number;
    attachments: number;
    avgLen: number;
    topAuthors: [string, number][];
    topWords: [string, number][];
    topDays: [string, number][];
}

function analyze(msgs: Msg[], myName: string): Report {
    const authors = new Map<string, number>();
    const words = new Map<string, number>();
    const days = new Map<string, number>();
    let chars = 0;
    let mine = 0;
    let attachments = 0;
    for (const m of msgs) {
        const who = m.author?.global_name || m.author?.username || "unknown";
        authors.set(who, (authors.get(who) ?? 0) + 1);
        if (who === myName) mine++;
        chars += (m.content || "").length;
        attachments += (m.attachments || []).length;
        const day = new Date(m.timestamp).toLocaleDateString();
        days.set(day, (days.get(day) ?? 0) + 1);
        for (const w of (m.content || "").toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9' ]/g, " ").split(/\s+/)) {
            if (w.length > 3 && !STOP.has(w)) words.set(w, (words.get(w) ?? 0) + 1);
        }
    }
    const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return {
        total: msgs.length, mine, attachments,
        avgLen: msgs.length ? Math.round(chars / msgs.length) : 0,
        topAuthors: top(authors, 5), topWords: top(words, 12), topDays: top(days, 7),
    };
}

function StatsPanel() {
    const [status, setStatus] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [report, setReport] = React.useState<Report | null>(null);

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
        setReport(null);
        setStatus("Scanning… 0");
        try {
            const cap = Math.max(100, Math.min(3000, Number(settings.store.scanLimit) || 1000));
            const out: Msg[] = [];
            let before: string | undefined;
            while (out.length < cap) {
                const res = await RestAPI.get({
                    url: `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`,
                });
                const page = (Array.isArray((res as any).body) ? (res as any).body : []) as Msg[];
                if (page.length === 0) break;
                out.push(...page);
                setStatus(`Scanning… ${out.length}`);
                if (page.length < 100) break;
                before = page[page.length - 1].id;
                await sleep(250);
            }
            let myName = "";
            try {
                const me = await RestAPI.get({ url: "/users/@me" });
                myName = (me as any).body?.global_name || (me as any).body?.username || "";
            } catch { /* stats still work, "mine" just stays 0 */ }
            setReport(analyze(out, myName));
            setStatus(`Scanned ${out.length} messages.`);
        } catch (e) {
            setStatus(e instanceof Error ? e.message : "Scan failed.");
        } finally {
            setBusy(false);
        }
    }

    const row = ([k, v]: [string, number]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{k}</span><b>{v}</b>
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={run} disabled={busy}>Scan current channel</button>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{status || "Local-only analytics for the open channel."}</div>
            {report && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12 }}>Messages: <b>{report.total}</b> · Yours: <b>{report.mine}</b> · Attachments: <b>{report.attachments}</b> · Avg length: <b>{report.avgLen}</b></div>
                    <div><div style={{ fontSize: 12, opacity: 0.7 }}>Top authors</div>{report.topAuthors.map(row)}</div>
                    <div><div style={{ fontSize: 12, opacity: 0.7 }}>Top words</div>{report.topWords.map(row)}</div>
                    <div><div style={{ fontSize: 12, opacity: 0.7 }}>Busiest days</div>{report.topDays.map(row)}</div>
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "ChatStats",
    description: "Local-only analytics for any channel: top authors, words, busy days, your share.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Utility", "Chat"],
    requiresRestart: false,
    settings,
});
