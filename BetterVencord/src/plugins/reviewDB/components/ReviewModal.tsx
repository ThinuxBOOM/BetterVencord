/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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
import { Auth } from "@plugins/reviewDB/auth";
import { ReviewType } from "@plugins/reviewDB/entities";
import { REVIEWS_PER_PAGE, UserReviewsData } from "@plugins/reviewDB/reviewDbApi";
import { cl } from "@plugins/reviewDB/utils";
import { Logger } from "@utils/Logger";
import { useForceUpdater } from "@utils/react";
import * as t from "@vencord/discord-types";
import { DefaultExtractAndLoadChunksRegex, extractAndLoadChunksLazy, findComponentByCodeLazy } from "@webpack";
import { Forms, Modal, openModalLazy, Text, useRef, useState } from "@webpack/common";
import { ComponentProps } from "react";

import ReviewComponent from "./ReviewComponent";
import ReviewsView, { ReviewsInputComponent } from "./ReviewsView";

const Paginator = findComponentByCodeLazy<ComponentProps<t.Paginator>>('rel:"prev",children:');
// This matches a massive module with ~230k chars so we need an anchor before to prevent REDOS
const requirePaginator = extractAndLoadChunksLazy(['name:"SearchResults"'], new RegExp(`name:"StageChannelCall",renderLoader:.+?(?:${DefaultExtractAndLoadChunksRegex.source}).{0,30}?name:"SearchResults"`));

const logger = new Logger("ReviewDB");

/** Paginator is a lazy Discord component that may vanish on updates.
 *  Fail-soft: render Prev/Next buttons instead of crashing the modal.
 *  (No state flips inside the fallback — setState during another
 *  component's render is itself a React crash.) */
function FallbackPager({ page, totalCount, onPageChange }: { page: number; totalCount: number; onPageChange(p: number): void; }) {
    const maxPage = Math.max(1, Math.ceil(totalCount / REVIEWS_PER_PAGE));
    if (maxPage <= 1) return null;
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", padding: 8 }}>
            <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</button>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Page {page} / {maxPage}</span>
            <button disabled={page >= maxPage} onClick={() => onPageChange(page + 1)}>Next</button>
        </div>
    );
}

function SafePaginator({ page, totalCount, onPageChange }: { page: number; totalCount: number; onPageChange(p: number): void; }) {
    if (Paginator == null) {
        return <FallbackPager page={page} totalCount={totalCount} onPageChange={onPageChange} />;
    }

    return (
        <ErrorBoundary
            fallback={() => {
                logger.warn("Paginator crashed (Discord update?), using fallback pager");
                return <FallbackPager page={page} totalCount={totalCount} onPageChange={onPageChange} />;
            }}
        >
            <Paginator
                currentPage={page}
                maxVisiblePages={5}
                pageSize={REVIEWS_PER_PAGE}
                totalCount={totalCount}
                onPageChange={onPageChange}
            />
        </ErrorBoundary>
    );
}

function ReviewsModal({ modalProps, modalKey, discordId, name, type }: { modalProps: t.RenderModalProps; modalKey: string, discordId: string; name: string; type: ReviewType; }) {
    const [data, setData] = useState<UserReviewsData>();
    const [signal, refetch] = useForceUpdater(true);
    const [page, setPage] = useState(1);

    const ref = useRef<HTMLDivElement>(null);

    const reviewCount = data?.reviewCount;
    const ownReview = data?.reviews.find(r => r.sender.discordID === Auth.user?.discordID);

    return (
        <Modal
            {...modalProps}
            size="lg"
            title={
                <Text variant="heading-lg/semibold" className={cl("modal-header")}>
                    {name}'s Reviews
                    {!!reviewCount && <span> ({reviewCount} Reviews)</span>}
                </Text>
            }
            preview={
                <div className={cl("modal-footer")}>
                    <div className={cl("modal-footer-wrapper")}>
                        {ownReview && (
                            <ReviewComponent
                                refetch={refetch}
                                review={ownReview}
                                profileId={discordId}
                            />
                        )}
                        <ReviewsInputComponent
                            isAuthor={ownReview != null}
                            discordId={discordId}
                            name={name}
                            refetch={refetch}
                            modalKey={modalKey}
                        />

                        {!!reviewCount && (
                            <SafePaginator
                                page={page}
                                totalCount={reviewCount}
                                onPageChange={setPage}
                            />
                        )}
                    </div>
                </div>
            }
            scrollerRef={ref}
        >
            <div className={cl("modal-reviews")}>
                <ErrorBoundary
                    fallback={() => (
                        <Forms.FormText>
                            Couldn't load reviews (the ReviewDB service or a Discord update broke this view). Try again later or update BetterVencord.
                        </Forms.FormText>
                    )}
                >
                    <ReviewsView
                        discordId={discordId}
                        name={name}
                        page={page}
                        refetchSignal={signal}
                        onFetchReviews={setData}
                        scrollToTop={() => ref.current?.scrollTo({ top: 0, behavior: "smooth" })}
                        hideOwnReview
                        type={type}
                    />
                </ErrorBoundary>
            </div>
        </Modal>
    );
}

export function openReviewsModal(discordId: string, name: string, type: ReviewType) {
    const modalKey = "vc-rdb-modal-" + Date.now();

    openModalLazy(async () => {
        try {
            await requirePaginator();
        } catch (e) {
            // Chunk may be renamed by Discord; SafePaginator falls back to Prev/Next.
            logger.warn("Paginator chunk failed to load, using fallback pager", e);
        }
        return props => (
            <ReviewsModal
                modalKey={modalKey}
                modalProps={props}
                discordId={discordId}
                name={name}
                type={type}
            />
        );
    }, { modalKey });
}
