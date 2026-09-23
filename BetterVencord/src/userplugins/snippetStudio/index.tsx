/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

/*
 * SnippetStudio - toggleable UI cleanups + your own custom CSS.
 * Curated snippets use stable hooks (aria-labels, data attributes) so they
 * survive Discord updates. Anything exotic goes in the custom CSS box.
 */

const STYLE_ID = "snippet-studio-managed";

interface Snippet {
    key: string;
    label: string;
    desc: string;
    css: string;
}

const SNIPPETS: Snippet[] = [
    {
        key: "hideGift",
        label: "Hide gift button",
        desc: "Removes the Nitro gift button from the message box",
        css: 'button[aria-label="Send a gift"]{display:none!important}',
    },
    {
        key: "hideGif",
        label: "Hide GIF button",
        desc: "Removes the GIF picker button from the message box",
        css: 'button[aria-label="Open GIF picker"]{display:none!important}',
    },
    {
        key: "hideStickers",
        label: "Hide sticker button",
        desc: "Removes the sticker picker button from the message box",
        css: 'button[aria-label="Open sticker picker"]{display:none!important}',
    },
    {
        key: "hideExplore",
        label: "Hide Explore servers",
        desc: "Removes the compass (public servers) button from the server list",
        css: '[data-list-item-id="guildsnav___explore"]{display:none!important}',
    },
    {
        key: "hideHelp",
        label: "Hide help icon",
        desc: "Removes the support-link help icon from the top bar",
        css: 'a[href="https://support.discord.com"]{display:none!important}',
    },
    {
        key: "hideActiveNow",
        label: "Hide Active Now sidebar",
        desc: "Removes the friends-activity column on wide windows",
        css: 'div[class*="nowPlayingColumn"]{display:none!important}',
    },
];

const settings = definePluginSettings(
    Object.fromEntries([
        ...SNIPPETS.map(s => [s.key, {
            type: OptionType.BOOLEAN,
            description: `${s.label} — ${s.desc}`,
            default: false,
            onChange: () => refresh(),
        }]),
        ["customCss", {
            type: OptionType.STRING,
            description: "Your own CSS (appended after the snippets)",
            placeholder: ".my-tweak { display: none !important; }",
            multiline: true,
            default: "",
            onChange: () => refresh(),
        }],
    ]) as Record<string, any>
);

function refresh() {
    const s = settings.store as Record<string, any>;
    const css = SNIPPETS.filter(sn => s[sn.key]).map(sn => sn.css).join("\n")
        + (s.customCss ? `\n${s.customCss}` : "");
    let el = document.getElementById(STYLE_ID);
    if (!css) {
        el?.remove();
        return;
    }
    if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.documentElement.appendChild(el);
    }
    el.textContent = `/* managed by SnippetStudio */\n${css}\n`;
}

export default definePlugin({
    name: "SnippetStudio",
    description: "Toggleable UI cleanups (gift/GIF/sticker buttons, Explore, Active Now…) plus your own custom CSS box.",
    authors: [{ name: "Thinux", id: 0n }],
    tags: ["Appearance", "Utility"],
    requiresRestart: false,
    settings,

    start() {
        refresh();
    },

    stop() {
        document.getElementById(STYLE_ID)?.remove();
    },

    toolboxActions: {
        "Re-apply snippets": () => refresh(),
    },
});
