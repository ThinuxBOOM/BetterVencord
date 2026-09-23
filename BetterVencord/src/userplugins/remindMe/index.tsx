/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, React, showToast } from "@webpack/common";

/*
 * RemindMe - right-click any message → "Remind me in an hour" (or a custom
 * delay) and get a toast when it's due. Purely local: nothing is sent,
 * scheduled, or automated on your account. Reminders survive restarts.
 */

const REM_KEY = "reminders";

interface Reminder {
    id: string;
    channelId: string;
    messageId: string;
    snippet: string;
    author: string;
    dueAt: number;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function readAll(): Promise<Reminder[]> {
    try {
        return ((await DataStore.get(REM_KEY)) as Reminder[] | undefined) ?? [];
    } catch {
        return [];
    }
}

async function persist(list: Reminder[]) {
    try {
        await DataStore.set(REM_KEY, list);
    } catch { /* best effort */ }
}

function fmtDue(dueAt: number): string {
    const ms = dueAt - Date.now();
    if (ms <= 0) return "due";
    const m = Math.round(ms / 60000);
    if (m < 60) return `in ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) return `in ${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
    return new Date(dueAt).toLocaleString();
}

function fire(r: Reminder) {
    timers.delete(r.id);
    void (async () => {
        await persist((await readAll()).filter(x => x.id !== r.id));
    })();
    try {
        showToast(`Reminder from ${r.author}: ${r.snippet}`);
    } catch { /* toasts unavailable — reminder still cleared */ }
}

function arm(r: Reminder) {
    disarm(r.id);
    const delay = r.dueAt - Date.now();
    if (delay <= 0) {
        fire(r);
        return;
    }
    timers.set(r.id, setTimeout(() => fire(r), Math.min(delay, 2147483647)));
}

function disarm(id: string) {
    const t = timers.get(id);
    if (t) {
        clearTimeout(t);
        timers.delete(id);
    }
}

export async function addReminder(channelId: string, messageId: string, snippet: string, author: string, minutes: number) {
    const mins = Math.max(1, Math.min(60 * 24 * 30, Math.round(minutes) || 60));
    const r: Reminder = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        channelId, messageId,
        snippet: snippet.slice(0, 140) || "(image/attachment)",
        author, dueAt: Date.now() + mins * 60000,
    };
    await persist([...(await readAll()), r]);
    arm(r);
    try {
        showToast(`Reminder set ${fmtDue(r.dueAt)}.`);
    } catch { /* fine */ }
}

const settings = definePluginSettings({
    defaultMinutes: {
        type: OptionType.NUMBER,
        description: "Default delay for the quick reminder (minutes)",
        default: 60,
    },
    panel: {
        type: OptionType.COMPONENT,
        component: RemindersPanel,
    },
});

function RemindersPanel() {
    const [list, setList] = React.useState<Reminder[]>([]);

    React.useEffect(() => {
        readAll().then(rs => setList(rs.sort((a, b) => a.dueAt - b.dueAt)));
    }, []);

    async function cancel(id: string) {
        disarm(id);
        const next = (await readAll()).filter(x => x.id !== id);
        await persist(next);
        setList(next);
    }

    if (list.length === 0) return <div style={{ fontSize: 12, opacity: 0.8 }}>No reminders. Right-click any message → Remind me.</div>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {list.map(r => (
                <div key={r.id} style={{ fontSize: 12, border: "1px solid var(--background-modifier-accent)", borderRadius: 8, padding: 6 }}>
                    <div><b>{r.author}</b> · {fmtDue(r.dueAt)}</div>
                    <div style={{ opacity: 0.8 }}>{r.snippet}</div>
                    <button onClick={() => cancel(r.id)}>Cancel</button>
                </div>
            ))}
        </div>
    );
}

export default definePlugin({
    name: "RemindMe",
    description: "Right-click any message to be reminded about it later. Local only — nothing is sent or automated.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Utility", "Chat"],
    requiresRestart: false,
    settings,

    contextMenus: {
        message(children, props: any) {
            const msg = props?.message;
            if (!msg?.id || !msg?.channel_id) return;
            const snippet = String(msg.content || "");
            const author = String(msg.author?.global_name || msg.author?.username || "someone");
            const quickMins = Number(settings.store.defaultMinutes) || 60;
            children.push(
                <Menu.MenuItem
                    id="ds-remind-quick"
                    label={`Remind me in ${quickMins >= 60 ? `${Math.round(quickMins / 60 * 10) / 10}h` : `${quickMins}m`}`}
                    action={() => {
                        void addReminder(msg.channel_id, msg.id, snippet, author, quickMins);
                    }}
                />,
                <Menu.MenuItem
                    id="ds-remind-custom"
                    label="Remind me in… (custom)"
                    action={() => {
                        const raw = window.prompt("Remind me in how many minutes?", String(quickMins));
                        if (raw == null) return;
                        const mins = Math.round(Number(raw));
                        if (!Number.isFinite(mins) || mins < 1) return;
                        void addReminder(msg.channel_id, msg.id, snippet, author, mins);
                    }}
                />,
            );
        },
    },

    async start() {
        for (const r of await readAll()) arm(r);
    },

    stop() {
        for (const id of [...timers.keys()]) disarm(id);
    },
});
