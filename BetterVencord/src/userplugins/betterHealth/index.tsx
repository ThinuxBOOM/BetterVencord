/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { checkForUpdates } from "@utils/updater";
import { React, showToast } from "@webpack/common";
import { getBuildNumber, patches } from "@webpack/patcher";

import gitHash from "~git-hash";

/*
 * BetterHealth - keeps BetterVencord future-proof.
 *
 * Two silent killers broke profiles in v1.0.x and neither told the user:
 *  1. Frozen builds: the installer pinned autoUpdate OFF, so Discord moved
 *     on while Vencord stood still until fragile patches (ReviewDB et al.)
 *     crashed on click.
 *  2. Silent lookup failures: webpack finds return null in prod and only
 *     explode later, at render time, far from the cause.
 *
 * This plugin watches both: it records the Discord build + our build hash
 * every startup and warns when Discord moved without us, and it surfaces
 * pending update checks so users act BEFORE things break. It never patches
 * anything itself (nothing to go stale).
 */

const logger = new Logger("BetterHealth");
const SNAP_KEY = "snapshot";
const DAY_MS = 24 * 60 * 60 * 1000;

interface Snapshot {
    discordBuild: number;
    vencordHash: string;
    at: number;
}

let interval: ReturnType<typeof setInterval> | null = null;
let lastNoticeAt = 0;

const settings = definePluginSettings({
    checkIntervalHours: {
        type: OptionType.NUMBER,
        description: "How often to check for BetterVencord updates (hours, 0 = only at startup)",
        default: 24,
    },
    warnOnDiscordDrift: {
        type: OptionType.BOOLEAN,
        description: "Warn when Discord updated but BetterVencord didn't (likely stale patches)",
        default: true,
    },
    panel: {
        type: OptionType.COMPONENT,
        component: HealthPanel,
    },
});

async function readSnapshot(): Promise<Snapshot | null> {
    try {
        return ((await DataStore.get(SNAP_KEY)) as Snapshot | undefined) ?? null;
    } catch {
        return null;
    }
}

function currentDiscordBuild(): number {
    try {
        return getBuildNumber() ?? -1;
    } catch {
        return -1;
    }
}

function notifyOnce(message: string) {
    // Rate-limit to one notice per hour so restarts don't spam.
    if (Date.now() - lastNoticeAt < 60 * 60 * 1000) return;
    lastNoticeAt = Date.now();
    try {
        showToast(message);
    } catch (e) {
        logger.warn("toast failed", e);
    }
}

async function driftCheck() {
    if (!settings.store.warnOnDiscordDrift) return;
    try {
        const prev = await readSnapshot();
        const now: Snapshot = { discordBuild: currentDiscordBuild(), vencordHash: gitHash, at: Date.now() };
        await DataStore.set(SNAP_KEY, now).catch(() => { /* best effort */ });
        if (!prev) return;
        if (prev.discordBuild !== -1 && now.discordBuild !== -1
            && prev.discordBuild !== now.discordBuild
            && prev.vencordHash === now.vencordHash) {
            notifyOnce(`Discord updated (${prev.discordBuild} → ${now.discordBuild}) but BetterVencord didn't. If things break, Settings > Vencord > Updater → Check now.`);
        }
    } catch (e) {
        logger.warn("drift check failed", e);
    }
}

async function updateCheck(manual: boolean): Promise<string> {
    if (IS_WEB) return "Update checks need the desktop app.";
    try {
        const outdated = await checkForUpdates();
        if (outdated) {
            if (!manual) notifyOnce("A BetterVencord update is available! Settings > Vencord > Updater to install it.");
            return "Update available — Settings > Vencord > Updater.";
        }
        return `Up to date (Discord build ${currentDiscordBuild()}, ${String(gitHash).slice(0, 7)}).`;
    } catch (e) {
        logger.warn("update check failed", e);
        return `Check failed (${e instanceof Error ? e.message : e}). If the loader is gone after a Discord update, re-run BetterVencord-Setup.`;
    }
}

function armInterval() {
    if (interval) {
        clearInterval(interval);
        interval = null;
    }
    const hours = Number(settings.store.checkIntervalHours) || 0;
    if (hours > 0 && !IS_WEB) {
        interval = setInterval(() => void updateCheck(false).catch(e => logger.warn(e)), Math.max(1, hours) * 60 * 60 * 1000);
    }
}

function HealthPanel() {
    const [status, setStatus] = React.useState("Not checked yet this session.");
    const [busy, setBusy] = React.useState(false);
    const [pending, setPending] = React.useState<string[]>([]);

    React.useEffect(() => {
        // Snapshot of not-yet-applied patches. Mostly lazy modules that load
        // on demand (normal) — but a plugin listed here AND broken in-app is
        // the first suspect after a Discord update.
        try {
            setPending([...new Set(patches.map(p => String(p.plugin)))].slice(0, 12));
        } catch {
            setPending([]);
        }
    }, []);

    async function checkNow() {
        if (busy) return;
        setBusy(true);
        try {
            setStatus(await updateCheck(true));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
                Discord build <b>{currentDiscordBuild()}</b> · BetterVencord <b>{String(gitHash).slice(0, 7)}</b> (v{VERSION})
                {IS_STANDALONE ? "" : " · non-standalone build (updater needs git — prefer release builds)"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={checkNow} disabled={busy}>Check for updates now</button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{status}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
                {pending.length === 0
                    ? "All patches applied."
                    : `Patches not yet applied (${pending.length} plugin(s), usually lazy-loaded — normal): ${pending.join(", ")}`}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
                If Discord itself just updated and things break everywhere, re-run BetterVencord-Setup (Repair/Install) — client updates wipe the loader.
            </div>
        </div>
    );
}

export default definePlugin({
    name: "BetterHealth",
    description: "Future-proofing monitor: warns when Discord outruns BetterVencord, surfaces updates, shows patch health. No patches of its own.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Utility"],
    requiresRestart: false,
    settings,

    flux: {
        // Discord is ready + stores settled by now; cheap moment for both checks.
        CONNECTION_OPEN() {
            void driftCheck();
            void updateCheck(false).catch(() => { /* logged inside */ });
        },
    },

    start() {
        armInterval();
        // Startup check too (CONNECTION_OPEN may already have fired on reload).
        void (async () => {
            await driftCheck();
            await updateCheck(false).catch(() => { /* logged inside */ });
        })();
    },

    stop() {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
    },
});
