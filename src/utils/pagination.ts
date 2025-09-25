/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type PaginationOptions = {
  pageSize?: number;
  pageToken?: string;
};

export type PaginationResult<TItem> = {
  items: readonly TItem[];
  nextPageToken?: string;
  previousPageToken?: string;
  startIndex: number;
  endIndex: number;
  invalidToken: boolean;
};

const DEFAULT_PAGE_SIZE = 20;

export function paginate<TItem>(
  items: readonly TItem[],
  options?: PaginationOptions,
): PaginationResult<TItem> {
  const total = items.length;

  if (!options || noPaginationOptions(options)) {
    return {
      items,
      nextPageToken: undefined,
      previousPageToken: undefined,
      startIndex: 0,
      endIndex: total,
      invalidToken: false,
    };
  }

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const {startIndex, invalidToken} = resolveStartIndex(
    options.pageToken,
    total,
  );

  const pageItems = items.slice(startIndex, startIndex + pageSize);
  const endIndex = startIndex + pageItems.length;

  const nextPageToken = endIndex < total ? String(endIndex) : undefined;
  const previousPageToken =
    startIndex > 0 ? String(Math.max(startIndex - pageSize, 0)) : undefined;

  return {
    items: pageItems,
    nextPageToken,
    previousPageToken,
    startIndex,
    endIndex,
    invalidToken,
  };
}

function noPaginationOptions(options: PaginationOptions): boolean {
  return (
    options.pageSize === undefined &&
    (options.pageToken === undefined || options.pageToken === null)
  );
}

function resolveStartIndex(
  pageToken: string | undefined,
  total: number,
): {
  startIndex: number;
  invalidToken: boolean;
} {
  if (pageToken === undefined || pageToken === null) {
    return {startIndex: 0, invalidToken: false};
  }

  const parsed = Number.parseInt(pageToken, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed >= total) {
    return {startIndex: 0, invalidToken: true};
  }

  return {startIndex: parsed, invalidToken: false};
}
