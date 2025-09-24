/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type HTTPRequest } from 'puppeteer-core';

export type NetworkPaginationOptions = {
    pageSize?: number;
    pageToken?: string;
};

export type NetworkPaginationResult = {
    requests: readonly HTTPRequest[];
    nextPageToken?: string;
    previousPageToken?: string;
    startIndex: number;
    endIndex: number;
    invalidToken: boolean;
};

const DEFAULT_PAGE_SIZE = 20;

export function paginateNetworkRequests(
    requests: readonly HTTPRequest[],
    options?: NetworkPaginationOptions,
): NetworkPaginationResult {
    const total = requests.length;

    if (!options || noPaginationOptions(options)) {
        return {
            requests,
            nextPageToken: undefined,
            previousPageToken: undefined,
            startIndex: 0,
            endIndex: total,
            invalidToken: false,
        };
    }

    const pageSize = validatePageSize(options.pageSize, total);
    const { startIndex, invalidToken } = resolveStartIndex(options.pageToken, total);

    const pageRequests = requests.slice(startIndex, startIndex + pageSize);
    const endIndex = startIndex + pageRequests.length;

    const nextPageToken = endIndex < total ? String(endIndex) : undefined;
    const previousPageToken =
        startIndex > 0 ? String(Math.max(startIndex - pageSize, 0)) : undefined;

    return {
        requests: pageRequests,
        nextPageToken,
        previousPageToken,
        startIndex,
        endIndex,
        invalidToken,
    };
}

function noPaginationOptions(options: NetworkPaginationOptions): boolean {
    return (
        options.pageSize === undefined &&
        (options.pageToken === undefined || options.pageToken === null)
    );
}

function validatePageSize(pageSize: number | undefined, total: number): number {
    if (pageSize === undefined) {
        return total || DEFAULT_PAGE_SIZE;
    }
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
        return DEFAULT_PAGE_SIZE;
    }
    return Math.min(pageSize, Math.max(total, 1));
}

function resolveStartIndex(pageToken: string | undefined, total: number): {
    startIndex: number;
    invalidToken: boolean;
} {
    if (pageToken === undefined || pageToken === null) {
        return { startIndex: 0, invalidToken: false };
    }

    const parsed = Number.parseInt(pageToken, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed >= total) {
        return { startIndex: 0, invalidToken: true };
    }

    return { startIndex: parsed, invalidToken: false };
}
