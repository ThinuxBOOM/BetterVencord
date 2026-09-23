/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { makeRange, OptionType, PluginNative } from "@utils/types";
import { React } from "@webpack/common";

/*
 * DiscordStyler - one-click Vencord theme studio.
 *
 * No webpack patches (nothing to break on Discord updates), no restart needed.
 * The managed CSS is injected via our own <style> element, rebuilt from
 * settings on every change. Optional desktop file-sync (native.ts) mirrors
 * the block into a real .theme.css file, managed markers included.
 */

const STYLE_ID = "discord-styler-managed";
const MANAGED_START = "/* === MANAGED BY DISCORD-STYLER - do not hand-edit below === */";
const MANAGED_END = "/* === END MANAGED === */";
const MAX_ANIMATED_BYTES = 8 * 1024 * 1024;
const LIBRARY_KEY = "library";
const BACKUP_KEY = "backupCss";
const MAX_LIBRARY = 20;

interface LibraryEntry {
    name: string;
    value: string; // data: URI or https:// URL
    at: number;
}

let backupTakenThisSession = false;

const settings = definePluginSettings({
    wallpaper: {
        type: OptionType.COMPONENT,
        component: WallpaperPicker,
    },
    hostMode: {
        type: OptionType.SELECT,
        description: "Instant embeds the image (offline, bigger). Webhook uploads via your Discord server then swaps in a tiny permanent link.",
        options: [
            { label: "Instant embed (recommended)", value: "instant", default: true },
            { label: "Link via webhook", value: "webhook" },
        ],
    },
    webhookUrl: {
        type: OptionType.STRING,
        description: "Discord webhook URL (Server Settings > Integrations > Webhooks). Only used in Link mode.",
        placeholder: "https://discord.com/api/webhooks/.../...",
        default: "",
    },
    mainColor: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("mainColor", "Main theme color", "#43b581", false),
    },
    panelDark: {
        type: OptionType.SLIDER,
        description: "Panels darkness",
        markers: makeRange(0, 0.9, 0.05),
        stickToMarkers: false,
        default: 0.35,
        onChange: () => refreshStyle(),
    },
    cardDark: {
        type: OptionType.SLIDER,
        description: "Cards darkness",
        markers: makeRange(0, 0.9, 0.05),
        stickToMarkers: false,
        default: 0.2,
        onChange: () => refreshStyle(),
    },
    msgDark: {
        type: OptionType.SLIDER,
        description: "Message box darkness",
        markers: makeRange(0, 0.95, 0.05),
        stickToMarkers: false,
        default: 0.6,
        onChange: () => refreshStyle(),
    },
    embedDark: {
        type: OptionType.SLIDER,
        description: "Embeds darkness",
        markers: makeRange(0, 0.95, 0.05),
        stickToMarkers: false,
        default: 0.6,
        onChange: () => refreshStyle(),
    },
    menuDark: {
        type: OptionType.SLIDER,
        description: "Context menu darkness",
        markers: makeRange(0, 0.95, 0.05),
        stickToMarkers: false,
        default: 0.8,
        onChange: () => refreshStyle(),
    },
    serverWidth: {
        type: OptionType.SELECT,
        description: "Server list width",
        options: [
            { label: "Single (62px)", value: "62px" },
            { label: "Double (126px)", value: "126px", default: true },
            { label: "Triple (184px)", value: "184px" },
            { label: "Quad (242px)", value: "242px" },
        ],
        onChange: () => refreshStyle(),
    },
    fontSize: {
        type: OptionType.SELECT,
        description: "Font size",
        options: [
            { label: "85%", value: "85%" },
            { label: "90%", value: "90%" },
            { label: "100%", value: "100%", default: true },
            { label: "110%", value: "110%" },
            { label: "125%", value: "125%" },
        ],
        onChange: () => refreshStyle(),
    },
    // ---- typography ----
    fontPrimary: {
        type: OptionType.STRING,
        description: "Main font (must be installed, or enable Google Fonts import below)",
        placeholder: "Inter, Segoe UI, sans-serif",
        default: "",
        onChange: () => refreshStyle(),
    },
    fontDisplay: {
        type: OptionType.STRING,
        description: "Display/headings font (empty = same as main)",
        placeholder: "Poppins, Segoe UI, sans-serif",
        default: "",
        onChange: () => refreshStyle(),
    },
    fontCode: {
        type: OptionType.STRING,
        description: "Code blocks font",
        placeholder: "JetBrains Mono, Consolas, monospace",
        default: "",
        onChange: () => refreshStyle(),
    },
    googleFontImport: {
        type: OptionType.BOOLEAN,
        description: "Auto-import the main font from Google Fonts by name",
        default: false,
        onChange: () => refreshStyle(),
    },
    // ---- text colors (empty = Discord default) ----
    textNormal: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("textNormal", "Message/body text", "", true),
    },
    textMuted: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("textMuted", "Muted text, timestamps", "", true),
    },
    textLink: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("textLink", "Links", "", true),
    },
    headerPrimary: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("headerPrimary", "Usernames, headers", "", true),
    },
    headerSecondary: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("headerSecondary", "Subheaders, descriptions", "", true),
    },
    // ---- accent / brand ----
    accent: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("accent", "Discord accent (buttons, blurple areas)", "", true),
    },
    // ---- solid backgrounds (override wallpaper where applied!) ----
    bgPrimary: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("bgPrimary", "Solid main background", "", true),
    },
    bgSecondary: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("bgSecondary", "Solid sidebar background", "", true),
    },
    bgTertiary: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("bgTertiary", "Solid deepest background", "", true),
    },
    // ---- channels ----
    channelColor: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("channelColor", "Channel list text", "", true),
    },
    unreadText: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("unreadText", "Unread channel text", "", true),
    },
    unreadBubble: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("unreadBubble", "Unread pill color", "", true),
    },
    // ---- mentions / scrollbar / status ----
    mentionBg: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("mentionBg", "Mention highlight background", "", true),
    },
    mentionBar: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("mentionBar", "Mention edge bar", "", true),
    },
    scrollbarThumb: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("scrollbarThumb", "Scrollbar thumb", "", true),
    },
    statusOnline: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("statusOnline", "Online dot", "", true),
    },
    statusIdle: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("statusIdle", "Idle dot", "", true),
    },
    statusDnd: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("statusDnd", "Do-not-disturb dot", "", true),
    },
    // ---- messages / code / dividers ----
    messageHover: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("messageHover", "Message row hover", "", true),
    },
    codeBg: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("codeBg", "Code block background", "", true),
    },
    codeBorder: {
        type: OptionType.STRING,
        description: "Code block border CSS (empty = theme default)",
        placeholder: "1px solid rgba(255,255,255,0.15)",
        default: "",
        onChange: () => refreshStyle(),
    },
    dividerColor: {
        type: OptionType.COMPONENT,
        component: makeColorSetting("dividerColor", "Unread divider bar", "", true),
    },
    // ---- home icon ----
    homeIcon: {
        type: OptionType.COMPONENT,
        component: HomeIconPicker,
    },
    homeZoom: {
        type: OptionType.SELECT,
        description: "Home icon zoom",
        options: [
            { label: "75%", value: "75%" },
            { label: "100%", value: "100%", default: true },
            { label: "125%", value: "125%" },
            { label: "150%", value: "150%" },
        ],
        onChange: () => refreshStyle(),
    },
    homePos: {
        type: OptionType.SELECT,
        description: "Home icon position",
        options: [
            { label: "Center", value: "center center", default: true },
            { label: "Left", value: "left center" },
            { label: "Right", value: "right center" },
            { label: "Top", value: "center top" },
            { label: "Bottom", value: "center bottom" },
        ],
        onChange: () => refreshStyle(),
    },
    maxWidth: {
        type: OptionType.NUMBER,
        description: "Wallpaper max width before embedding (px)",
        default: 1920,
    },
    jpegQuality: {
        type: OptionType.NUMBER,
        description: "Wallpaper JPEG quality (50-95)",
        default: 82,
    },
    fileSync: {
        type: OptionType.BOOLEAN,
        description: "Also mirror the managed block into a real theme file (desktop only, needs rebuild with native.ts)",
        default: false,
        target: "DESKTOP",
    },
    syncFileName: {
        type: OptionType.STRING,
        description: "Theme file name for file-sync (inside Vencord/Vesktop themes folder)",
        default: "NotAnotherAnimeTheme.theme.css",
        target: "DESKTOP",
    },
});

// ---------------------------------------------------------------- styles

function cssUrl(value: string): string {
    const v = value.trim();
    return v.toLowerCase().startsWith("url(") ? v : `url("${v}")`;
}

function isHex(v: unknown): v is string {
    return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim());
}

/** Darken #rrggbb by factor f (0-1). Falls back to dim gray on bad input. */
function shade(hex: string, f: number): string {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    if (!m) return "#3c45a5";
    const px = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(m[i], 16) * f)));
    const hx = (n: number) => n.toString(16).padStart(2, "0");
    return `#${hx(px(1))}${hx(px(2))}${hx(px(3))}`;
}

function googleFontImportUrl(): string {
    if (!settings.store.googleFontImport) return "";
    const first = String(settings.store.fontPrimary || "").split(",")[0].trim().replace(/["']/g, "");
    if (!first || /^(gg sans|whitney|helvetica|arial|sans-serif|system-ui)/i.test(first)) return "";
    const family = first.replace(/\s+/g, "+");
    return `@import url("https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap");\n`;
}

function buildManagedCss(): string {
    const s = settings.store;
    const root: string[] = [];
    const opt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    // wallpaper + theme core
    if (s.wallpaper) root.push(`  --theme-background-image: ${cssUrl(s.wallpaper as string)};`);
    root.push(`  --main-theme-color: ${opt(s.mainColor) || "#43b581"};`);
    root.push(`  --message-box-transparency: rgba(0, 0, 0, ${s.msgDark});`);
    root.push(`  --embed-background-transparency: rgba(0, 0, 0, ${s.embedDark});`);
    root.push(`  --context-menu-transparency: rgba(15, 15, 15, ${s.menuDark});`);
    root.push(`  --server-listing-width: ${s.serverWidth};`);
    root.push(`  --font-size: ${s.fontSize};`);

    // typography (Discord-native vars: theme-agnostic)
    if (opt(s.fontPrimary)) root.push(`  --font-primary: ${opt(s.fontPrimary)};`);
    if (opt(s.fontDisplay)) root.push(`  --font-display: ${opt(s.fontDisplay)};`);
    if (opt(s.fontCode)) root.push(`  --font-code: ${opt(s.fontCode)};`);

    // text colors
    if (opt(s.textNormal)) root.push(`  --text-normal: ${opt(s.textNormal)};`);
    if (opt(s.textMuted)) root.push(`  --text-muted: ${opt(s.textMuted)};`);
    if (opt(s.textLink)) root.push(`  --text-link: ${opt(s.textLink)};`);
    if (opt(s.headerPrimary)) root.push(`  --header-primary: ${opt(s.headerPrimary)};`);
    if (opt(s.headerSecondary)) root.push(`  --header-secondary: ${opt(s.headerSecondary)};`);

    // accent -> brand scale (base / hover / active derived)
    if (isHex(opt(s.accent))) {
        const a = opt(s.accent);
        root.push(`  --brand-500: ${a};`);
        root.push(`  --brand-560: ${shade(a, 0.82)};`);
        root.push(`  --brand-600: ${shade(a, 0.65)};`);
        root.push(`  --background-accent: ${a};`);
        root.push(`  --text-brand: ${a};`);
    }

    // solid backgrounds (cover the wallpaper where they apply)
    if (opt(s.bgPrimary)) root.push(`  --background-primary: ${opt(s.bgPrimary)};`);
    if (opt(s.bgSecondary)) root.push(`  --background-secondary: ${opt(s.bgSecondary)};`);
    if (opt(s.bgTertiary)) root.push(`  --background-tertiary: ${opt(s.bgTertiary)};`);

    // channels
    if (opt(s.channelColor)) root.push(`  --channels-default: ${opt(s.channelColor)};`);
    if (opt(s.unreadText)) root.push(`  --unread-text-channel-color: ${opt(s.unreadText)};`);
    if (opt(s.unreadBubble)) root.push(`  --unread-text-channel-bubble-color: ${opt(s.unreadBubble)};`);

    // mentions (classic + current variable generations)
    if (opt(s.mentionBg)) {
        const bg = opt(s.mentionBg);
        root.push(`  --mention-background: ${bg};`);
        root.push(`  --background-mentioned: ${bg};`);
        root.push(`  --background-mentioned-hover: ${bg};`);
        root.push(`  --message-mentioned-background: ${bg};`);
    }
    if (opt(s.mentionBar)) {
        const bar = opt(s.mentionBar);
        root.push(`  --mention-foreground: ${bar};`);
        root.push(`  --message-mentioned-indicator: ${bar};`);
    }

    // scrollbar / status / message hover
    if (opt(s.scrollbarThumb)) {
        root.push(`  --scrollbar-auto-thumb: ${opt(s.scrollbarThumb)};`);
        root.push(`  --scrollbar-thin-thumb: ${opt(s.scrollbarThumb)};`);
    }
    if (opt(s.statusOnline)) root.push(`  --status-positive: ${opt(s.statusOnline)};`);
    if (opt(s.statusIdle)) root.push(`  --status-warning: ${opt(s.statusIdle)};`);
    if (opt(s.statusDnd)) root.push(`  --status-danger: ${opt(s.statusDnd)};`);
    if (opt(s.messageHover)) root.push(`  --background-message-hover: ${opt(s.messageHover)};`);

    // code blocks + unread divider (theme vars)
    if (opt(s.codeBg)) root.push(`  --code-markup-background-color: ${opt(s.codeBg)};`);
    if (opt(s.codeBorder)) root.push(`  --code-markup-border: ${opt(s.codeBorder)};`);
    if (opt(s.dividerColor)) root.push(`  --unread-message-divider-color: ${opt(s.dividerColor)};`);

    // home icon (theme vars)
    if (opt(s.homeIcon)) root.push(`  --home-icon-image: ${cssUrl(opt(s.homeIcon))};`);
    root.push(`  --home-icon-image-zoom: ${s.homeZoom || "100%"};`);
    root.push(`  --home-icon-image-position: ${s.homePos || "center center"};`);

    return `${googleFontImportUrl()}${MANAGED_START}\n:root {\n${root.join("\n")}\n}\n\n` +
        "aside.aside_f58343,\ndiv[class*=\"content_\"] > aside,\ndiv.inner__7f9c0 {\n  background: transparent !important;\n}\n\n" +
        `div.outer_c0bea0 {\n  --background-surface-high: rgba(0, 0, 0, ${s.cardDark}) !important;\n  --profile-body-background-color: rgba(0, 0, 0, ${s.cardDark}) !important;\n  background-color: rgba(0, 0, 0, ${s.panelDark}) !important;\n}\n\n` +
        `div.outer_c0bea0 div[class*="overlayBackground"] {\n  background-image: none !important;\n  background-color: rgba(0, 0, 0, ${s.cardDark}) !important;\n}\n${MANAGED_END}\n`;
}

function refreshStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        // appended after <head>: wins equal-specificity ties vs theme styles
        document.documentElement.appendChild(el);
    }
    el.textContent = buildManagedCss();
    if (settings.store.fileSync) void syncToFile().catch(() => { /* status shown in picker */ });
}

async function takeBackupOnce() {
    if (backupTakenThisSession) return;
    backupTakenThisSession = true;
    const prev = await DataStore.get(BACKUP_KEY);
    if (prev == null) await DataStore.set(BACKUP_KEY, (settings.store.wallpaper as string) || "");
}

// ---------------------------------------------------------------- images

function downscaleToDataUrl(img: HTMLImageElement, maxWidth: number, quality: number): string {
    const scale = Math.min(1, maxWidth / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
}

function fileToWallpaperValue(file: File): Promise<string> {
    const maxWidth = Math.max(640, Math.min(3840, Number(settings.store.maxWidth) || 1920));
    const quality = Math.max(0.5, Math.min(0.95, (Number(settings.store.jpegQuality) || 82) / 100));
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => {
            const dataUrl = String(reader.result);
            // animated GIF/WebP: keep original bytes so animation survives
            if ((file.type === "image/gif" || file.type === "image/webp") && file.size <= MAX_ANIMATED_BYTES) {
                const probe = new Image();
                probe.onload = () => resolve(dataUrl);
                probe.onerror = () => reject(new Error("Not a readable image."));
                probe.src = dataUrl;
                return;
            }
            if (file.size > MAX_ANIMATED_BYTES && file.type === "image/gif") {
                reject(new Error(`${file.name} is too big to embed - use Link via webhook mode.`));
                return;
            }
            const img = new Image();
            img.onload = () => {
                try {
                    resolve(downscaleToDataUrl(img, maxWidth, quality));
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

async function uploadViaWebhook(file: File, value: string): Promise<string> {
    const hook = String(settings.store.webhookUrl || "").trim();
    if (!hook.includes("discord.com/api/webhooks/")) throw new Error("Paste a Discord webhook URL in settings first.");
    // re-encode to the optimized bytes so the upload is fast
    const res = await fetch(value);
    const blob = await res.blob();
    const ext = file.name.toLowerCase().endsWith(".gif") ? ".gif" : ".jpg";
    const form = new FormData();
    form.append("files[0]", blob, file.name.replace(/\.[a-z0-9]+$/i, "") + ext);
    form.append("content", `DiscordStyler wallpaper: ${file.name}`);
    const resp = await fetch(hook + (hook.includes("?") ? "&wait=true" : "?wait=true"), { method: "POST", body: form });
    let data: any = null;
    try { data = await resp.json(); } catch { /* fall through to error below */ }
    const url = data?.attachments?.[0]?.url;
    if (!resp.ok || !url) throw new Error(`Webhook upload failed (${resp.status}): ${JSON.stringify(data)?.slice(0, 160)}`);
    return String(url);
}

async function pushToLibrary(name: string, value: string) {
    const lib = ((await DataStore.get(LIBRARY_KEY)) as LibraryEntry[] | undefined) ?? [];
    const next = [{ name, value, at: Date.now() }, ...lib.filter(e => e.name !== name)].slice(0, MAX_LIBRARY);
    await DataStore.set(LIBRARY_KEY, next);
    return next;
}

// ---------------------------------------------------------------- UI

function WallpaperPicker({ setValue }: { setValue(v: string): void; }) {
    const { wallpaper, hostMode } = settings.use(["wallpaper", "hostMode"]);
    const [status, setStatus] = React.useState("");
    const [library, setLibrary] = React.useState<LibraryEntry[]>([]);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        DataStore.get(LIBRARY_KEY).then(v => setLibrary((v as LibraryEntry[] | undefined) ?? []));
    }, []);

    async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || busy) return;
        setBusy(true);
        setStatus("Processing…");
        try {
            await takeBackupOnce();
            const value = await fileToWallpaperValue(file);
            setValue(value);
            refreshStyle();
            setLibrary(await pushToLibrary(file.name, value));
            const kb = Math.round((value.length * 3 / 4) / 1024);
            setStatus(`Applied ${file.name} instantly (~${kb} KB embedded).`);
            if (hostMode === "webhook") {
                setStatus("Uploading permanent link…");
                try {
                    const url = await uploadViaWebhook(file, value);
                    setValue(url);
                    refreshStyle();
                    setLibrary(await pushToLibrary(file.name, url));
                    setStatus("Link ready, theme slimmed down.");
                } catch (err) {
                    setStatus(`Link upload failed (${err instanceof Error ? err.message : err}) - embedded copy is still live.`);
                }
            }
        } catch (err) {
            setStatus(err instanceof Error ? err.message : "Apply failed.");
        } finally {
            setBusy(false);
        }
    }

    function applyEntry(entry: LibraryEntry) {
        setValue(entry.value);
        refreshStyle();
        setStatus(`Applied ${entry.name}.`);
    }

    async function restoreBackup() {
        const prev = (await DataStore.get(BACKUP_KEY)) as string | undefined;
        setValue(prev ?? "");
        refreshStyle();
        setStatus("Restored pre-session wallpaper.");
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onFile} disabled={busy} />
            {wallpaper ? <img src={wallpaper as string} alt="current wallpaper" style={{ maxWidth: 320, borderRadius: 8 }} /> : null}
            <div style={{ opacity: 0.85, fontSize: 12 }}>{status || "Pick an image - it goes live in Discord immediately."}</div>
            {library.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {library.map(e => (
                        <button key={e.name + e.at} onClick={() => applyEntry(e)} title={e.name}
                            style={{ border: "1px solid var(--background-modifier-accent)", borderRadius: 8, padding: 0, cursor: "pointer", background: "transparent" }}>
                            <img src={e.value} alt={e.name} style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 7, display: "block" }} />
                        </button>
                    ))}
                </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={restoreBackup}>Restore pre-session wallpaper</button>
                <button onClick={() => { setValue(""); refreshStyle(); setStatus("Wallpaper cleared (theme default)."); }}>Clear</button>
            </div>
        </div>
    );
}

function makeColorSetting(key: string, label: string, fallback: string, allowEmpty: boolean) {
    return function ColorSetting({ setValue }: { setValue(v: string): void; }) {
        // NOTE: settings.use() must only be touched here at render time, never in
        // the factory body above: the factory runs while `settings` is still being
        // initialized (TDZ), which threw at load and broke the whole plugin system.
        // settings.use() is typed for literal keys; this factory is keyed
        // dynamically, so call it through a string-based signature (same runtime).
        const useAny = settings.use as unknown as (filter?: string[]) => Record<string, any>;
        const [current, setCurrent] = React.useState<string | undefined>(undefined);
        const stored = useAny([key])[key] as string | undefined;
        const hex = current ?? stored ?? "";
        const shown = isHex(hex) ? hex : fallback;
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={shown}
                    onChange={e => { setCurrent(e.target.value); setValue(e.target.value); refreshStyle(); }} />
                <input type="text" value={hex} placeholder={allowEmpty ? "(Discord default)" : fallback}
                    onChange={e => { setCurrent(e.target.value); setValue(e.target.value); refreshStyle(); }} style={{ width: 110 }} />
                <span style={{ opacity: 0.7, fontSize: 12 }}>{label}</span>
                {allowEmpty && hex && (
                    <button onClick={() => { setCurrent(""); setValue(""); refreshStyle(); }}>Clear</button>
                )}
            </div>
        );
    };
}

function fileToIconValue(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.onload = () => {
            const dataUrl = String(reader.result);
            if (file.type === "image/gif" && file.size <= MAX_ANIMATED_BYTES) {
                const probe = new Image();
                probe.onload = () => resolve(dataUrl);
                probe.onerror = () => reject(new Error("Not a readable image."));
                probe.src = dataUrl;
                return;
            }
            const img = new Image();
            img.onload = () => {
                try {
                    resolve(downscaleToDataUrl(img, 256, 0.8));
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

function HomeIconPicker({ setValue }: { setValue(v: string): void; }) {
    const { homeIcon } = settings.use(["homeIcon"]);
    const [status, setStatus] = React.useState("");
    async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setStatus("Processing…");
        try {
            const value = await fileToIconValue(file);
            setValue(value);
            refreshStyle();
            setStatus(`Home icon set (${file.name}).`);
        } catch (err) {
            setStatus(err instanceof Error ? err.message : "Failed.");
        }
    }
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {homeIcon ? <img src={homeIcon as string} alt="home icon" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} /> : null}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onFile} />
            <span style={{ opacity: 0.7, fontSize: 12 }}>{status || "Home button icon"}</span>
            {homeIcon ? <button onClick={() => { setValue(""); refreshStyle(); setStatus("Cleared."); }}>Clear</button> : null}
        </div>
    );
}

// ---------------------------------------------------------------- file sync (desktop, opt-in)

const Native = VencordNative.pluginHelpers.DiscordStyler as PluginNative<typeof import("./native")>;

async function syncToFile(): Promise<void> {
    if (!Native) throw new Error("native helper unavailable (rebuild with native.ts)");
    await Native.writeManagedBlock(
        String(settings.store.syncFileName),
        MANAGED_START,
        MANAGED_END,
        buildManagedCss(),
    );
}

// ---------------------------------------------------------------- plugin

export default definePlugin({
    name: "DiscordStyler",
    description: "Full appearance studio: instant wallpapers, fonts + text colors, accent/brand scale, backgrounds, channels, mentions, scrollbar, status, code blocks, home icon - live, no restart.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Appearance"],
    requiresRestart: false,
    settings,

    start() {
        refreshStyle();
    },

    stop() {
        document.getElementById(STYLE_ID)?.remove();
    },

    toolboxActions: {
        "Re-apply style": () => refreshStyle(),
        "Clear wallpaper": () => {
            (settings.store as any).wallpaper = "";
            refreshStyle();
        },
    },
});
