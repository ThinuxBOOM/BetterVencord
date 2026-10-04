/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import ErrorBoundary from "@components/ErrorBoundary";
import { Auth, authorize } from "@plugins/reviewDB/auth";
import { Review, ReviewType } from "@plugins/reviewDB/entities";
import { addReview, getReviews, REVIEWS_PER_PAGE, UserReviewsData } from "@plugins/reviewDB/reviewDbApi";
import { settings } from "@plugins/reviewDB/settings";
import { cl, showToast } from "@plugins/reviewDB/utils";
import { Logger } from "@utils/Logger";
import { useAwaiter, useForceUpdater } from "@utils/react";
import { findByCodeLazy, findByPropsLazy, findComponentByCodeLazy } from "@webpack";
import { Forms, React, RelationshipStore, useRef, UserStore } from "@webpack/common";

import ReviewComponent from "./ReviewComponent";

const Transforms = findByPropsLazy("insertNodes", "textToText");
const Editor = findByPropsLazy("start", "end", "toSlateRange");
const ChatInputTypes = findByPropsLazy("FORM", "USER_PROFILE");
const InputComponent = findComponentByCodeLazy("editorClassName", "CHANNEL_TEXT_AREA");
const createChannelRecordFromServer = findByCodeLazy(".GUILD_TEXT]", "fromServer)");

const logger = new Logger("ReviewDB");

interface UserProps {
    discordId: string;
    name: string;
}

interface Props extends UserProps {
    onFetchReviews(data: UserReviewsData): void;
    refetchSignal?: unknown;
    showInput?: boolean;
    page?: number;
    scrollToTop?(): void;
    hideOwnReview?: boolean;
    type: ReviewType;
}

export default function ReviewsView({
    discordId,
    name,
    onFetchReviews,
    refetchSignal,
    scrollToTop,
    page = 1,
    showInput = false,
    hideOwnReview = false,
    type,
}: Props) {
    const [signal, refetch] = useForceUpdater(true);

    const [reviewData] = useAwaiter(() => getReviews(discordId, { offset: (page - 1) * REVIEWS_PER_PAGE, limit: REVIEWS_PER_PAGE, fetchVotes: true }), {
        fallbackValue: null,
        deps: [refetchSignal, signal, page],
        onSuccess: data => {
            if (!data) return;
            if (settings.store.hideBlockedUsers) data!.reviews = data!.reviews?.filter(r => !RelationshipStore.isBlocked(r.sender.discordID));
            const systemReviews = data!.reviews.filter(r => r.type === ReviewType.System);
            const normalReviews = data!.reviews.filter(r => r.type !== ReviewType.System);

            data!.reviews = [...systemReviews, ...normalReviews];
            scrollToTop?.();
            onFetchReviews(data!);
        }
    });

    if (!reviewData) return null;

    return (
        <>
            <ReviewList
                refetch={refetch}
                reviews={reviewData!.reviews}
                hideOwnReview={hideOwnReview}
                profileId={discordId}
                type={type}
            />

            {showInput && (
                <ReviewsInputComponent
                    name={name}
                    discordId={discordId}
                    refetch={refetch}
                    isAuthor={reviewData!.reviews?.some(r => r.sender.discordID === UserStore.getCurrentUser()?.id)}
                />
            )}
        </>
    );
}

function ReviewList({ refetch, reviews, hideOwnReview, profileId, type }: { refetch(): void; reviews: Review[]; hideOwnReview: boolean; profileId: string; type: ReviewType; }) {
    const myId = UserStore.getCurrentUser()?.id;

    return (
        <div className={cl("view")}>
            {reviews?.map(review =>
                (review.sender.discordID !== myId || !hideOwnReview) &&
                <ReviewComponent
                    key={review.id}
                    review={review}
                    refetch={refetch}
                    profileId={profileId}
                />
            )}

            {reviews?.length === 0 && (
                <Forms.FormText className={cl("placeholder")}>
                    Looks like nobody reviewed this {type === ReviewType.User ? "user" : "server"} yet. You could be the first!
                </Forms.FormText>
            )}
        </div>
    );
}

/**
 * Resolve Discord's chat input type WITHOUT mutating shared webpack modules.
 * Returns a private copy, or null when Discord renamed things (fail-soft:
 * the review list still renders, only the input is hidden with a notice).
 */
function resolveInputType(): Record<string, unknown> | null {
    try {
        const base = (ChatInputTypes as any)?.USER_PROFILE_REPLY;
        if (base == null || (typeof base !== "object" && typeof base !== "number" && typeof base !== "string"))
            return base ?? null;
        if (typeof base === "object") return { ...base, disableAutoFocus: true };
        return base as any;
    } catch (e) {
        logger.warn("Failed to resolve chat input type (Discord update?), hiding review input", e);
        return null;
    }
}

function resolveChannel() {
    try {
        if (typeof createChannelRecordFromServer !== "function") return null;
        return createChannelRecordFromServer({ id: "0", type: 1 });
    } catch (e) {
        logger.warn("Failed to create review channel record (Discord update?), hiding review input", e);
        return null;
    }
}

function ReviewsInputFallback() {
    return (
        <Forms.FormText className={cl("placeholder")}>
            Adding reviews is unavailable after a Discord update. Reading still works — update BetterVencord to restore it.
        </Forms.FormText>
    );
}


export const ReviewsInputComponent = ErrorBoundary.wrap(function ReviewsInputComponent(
    { discordId, isAuthor, refetch, name, modalKey }: { discordId: string, name: string; isAuthor: boolean; refetch(): void; modalKey?: string; }
) {
    const { token } = Auth;
    const editorRef = useRef<any>(null);
    // Never mutate the shared Discord enum (frozen in prod -> TypeError crash).
    // resolveInputType() returns a private copy or null when Discord changed.
    const inputType = resolveInputType();
    const channel = resolveChannel();

    if (inputType == null || channel == null || InputComponent == null) {
        return <ReviewsInputFallback />;
    }

    return (
        <>
            <div onClick={() => {
                if (!token) {
                    showToast("Opening authorization window...");
                    authorize();
                }
            }}>
                <InputComponent
                    className={cl("input")}
                    channel={channel}
                    placeholder={
                        !token
                            ? "You need to authorize to review users!"
                            : isAuthor
                                ? `Update review for @${name}`
                                : `Review @${name}`
                    }
                    type={inputType}
                    disableThemedBackground={true}
                    setEditorRef={ref => editorRef.current = ref}
                    parentModalKey={modalKey}
                    textValue=""
                    onSubmit={
                        async res => {
                            const response = await addReview({
                                userid: discordId,
                                comment: res.value,
                            });

                            if (response) {
                                refetch();

                                try {
                                    const slateEditor = editorRef.current.ref.current.getSlateEditor();

                                    // clear editor
                                    Transforms.delete(slateEditor, {
                                        at: {
                                            anchor: Editor.start(slateEditor, []),
                                            focus: Editor.end(slateEditor, []),
                                        }
                                    });
                                } catch (e) {
                                    logger.warn("Failed to clear review editor", e);
                                }
                            }

                            // even tho we need to return this, it doesnt do anything
                            return {
                                shouldClear: false,
                                shouldRefocus: true,
                            };
                        }
                    }
                />
            </div>

        </>
    );
}, { noop: false, message: "The review input crashed (likely a Discord update). The review list below still works." });
