/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {type HTTPRequest, type ResourceType} from 'puppeteer-core';

export const FILTERABLE_RESOURCE_TYPES = [
  'document',
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'xhr',
  'fetch',
  'prefetch',
  'websocket',
  'preflight',
  'other',
] as const satisfies readonly ResourceType[];

export type FilterableResourceType = (typeof FILTERABLE_RESOURCE_TYPES)[number];

export type NetworkRequestsListingOptions = {
  pageSize?: number;
  pageToken?: string;
  requestType?: FilterableResourceType | FilterableResourceType[];
};

export type NetworkRequestsListingResult = {
  requests: readonly HTTPRequest[];
  nextPageToken?: string;
  previousPageToken?: string;
  startIndex: number;
  endIndex: number;
  invalidToken: boolean;
  total: number;
  appliedRequestType?: FilterableResourceType | FilterableResourceType[];
};

const DEFAULT_PAGE_SIZE = 20;
const FILTERABLE_RESOURCE_TYPES_SET = new Set<FilterableResourceType>(
  FILTERABLE_RESOURCE_TYPES,
);

export function isFilterableResourceType(
  value: ResourceType | string,
): value is FilterableResourceType {
  return FILTERABLE_RESOURCE_TYPES_SET.has(value as FilterableResourceType);
}

export function sanitizeRequestTypeFilter(
  requestType?: string | string[] | null,
): FilterableResourceType | FilterableResourceType[] | undefined {
  if (requestType === undefined || requestType === null) {
    return undefined;
  }

  const values = Array.isArray(requestType) ? requestType : [requestType];
  const sanitized = values.filter(isFilterableResourceType);

  if (!sanitized.length) {
    return undefined;
  }

  return Array.isArray(requestType) ? sanitized : sanitized[0];
}

export function filterNetworkRequests(
  requests: readonly HTTPRequest[],
  requestType?: FilterableResourceType | FilterableResourceType[],
): readonly HTTPRequest[] {
  if (!requestType) {
    return requests;
  }

  const normalizedTypes = new Set<FilterableResourceType>(
    Array.isArray(requestType) ? requestType : [requestType],
  );

  if (!normalizedTypes.size) {
    return requests;
  }

  return requests.filter(request => {
    const type = request.resourceType();
    if (!isFilterableResourceType(type)) {
      return false;
    }
    return normalizedTypes.has(type);
  });
}

export function paginateNetworkRequests(
  requests: readonly HTTPRequest[],
  options?: NetworkRequestsListingOptions,
): NetworkRequestsListingResult {
  const sanitizedOptions = options ?? {};
  const filteredRequests = filterNetworkRequests(
    requests,
    sanitizedOptions.requestType,
  );
  const total = filteredRequests.length;

  const hasPaginationOptions = hasPagination(sanitizedOptions);

  if (!hasPaginationOptions) {
    return {
      requests: filteredRequests,
      nextPageToken: undefined,
      previousPageToken: undefined,
      startIndex: 0,
      endIndex: total,
      invalidToken: false,
      total,
      appliedRequestType: sanitizedOptions.requestType,
    };
  }

  const pageSize = validatePageSize(sanitizedOptions.pageSize, total);
  const {startIndex, invalidToken} = resolveStartIndex(
    sanitizedOptions.pageToken,
    total,
  );

  const pageRequests = filteredRequests.slice(
    startIndex,
    startIndex + pageSize,
  );
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
    total,
    appliedRequestType: sanitizedOptions.requestType,
  };
}

function hasPagination(options: NetworkRequestsListingOptions): boolean {
  return (
    options.pageSize !== undefined ||
    (options.pageToken !== undefined && options.pageToken !== null)
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
    return {startIndex: 0, invalidToken: total > 0};
  }

  return {startIndex: parsed, invalidToken: false};
}
