/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';
import { FILTERABLE_RESOURCE_TYPES } from '../utils/networkUtils.js';
import { defineTool } from './ToolDefinition.js';
import { ToolCategories } from './categories.js';

export const listNetworkRequests = defineTool({
  name: 'list_network_requests',
  description: `List all requests for the currently selected page`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    pageSize: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .describe(
        'Maximum number of requests to return. When omitted, returns all requests.',
      ),
    pageToken: z
      .string()
      .optional()
      .describe(
        'Opaque token representing the next page. Use the token returned by a previous call.',
      ),
    requestType: z
      .enum(FILTERABLE_RESOURCE_TYPES)
      .optional()
      .describe(
        `Type of request to return. When omitted, returns all requests. Available types are: ${FILTERABLE_RESOURCE_TYPES.join(', ')}.`,
      ),
  },
  handler: async (request, response) => {
    response.setIncludeNetworkRequests(true, {
      pageSize: request.params.pageSize,
      pageToken: request.params.pageToken ?? null,
      requestType: request.params.requestType ?? null,
    });
  },
});

export const getNetworkRequest = defineTool({
  name: 'get_network_request',
  description: `Gets a network request by URL. You can get all requests by calling ${listNetworkRequests.name}.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    url: z.string().describe('The URL of the request.'),
  },
  handler: async (request, response, _context) => {
    response.attachNetworkRequest(request.params.url);
    response.setIncludeNetworkRequests(true);
  },
});
