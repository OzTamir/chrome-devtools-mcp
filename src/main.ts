/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolResult,
  SetLevelRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

import {McpResponse} from './McpResponse.js';
import {McpContext} from './McpContext.js';

import {ToolDefinition} from './tools/ToolDefinition.js';
import {logger, saveLogsToFile} from './logger.js';
import {Channel, resolveBrowser} from './browser.js';
import * as emulationTools from './tools/emulation.js';
import * as consoleTools from './tools/console.js';
import * as inputTools from './tools/input.js';
import * as networkTools from './tools/network.js';
import * as pagesTools from './tools/pages.js';
import * as performanceTools from './tools/performance.js';
import * as screenshotTools from './tools/screenshot.js';
import * as scriptTools from './tools/script.js';
import * as snapshotTools from './tools/snapshot.js';

import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import {Mutex} from './Mutex.js';

export const cliOptions = {
  browserUrl: {
    type: 'string' as const,
    description:
      'Connect to a running Chrome instance using port forwarding. For more details see: https://developer.chrome.com/docs/devtools/remote-debugging/local-server.',
    alias: 'u',
    coerce: (url: string) => {
      new URL(url);
      return url;
    },
  },
  headless: {
    type: 'boolean' as const,
    description: 'Whether to run in headless (no UI) mode.',
    default: false,
  },
  executablePath: {
    type: 'string' as const,
    description: 'Path to custom Chrome executable.',
    conflicts: 'browserUrl',
    alias: 'e',
  },
  isolated: {
    type: 'boolean' as const,
    description:
      'If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed.',
    default: false,
  },
  customDevtools: {
    type: 'string' as const,
    description: 'Path to custom DevTools.',
    hidden: true,
    conflicts: 'browserUrl',
    alias: 'd',
  },
  channel: {
    type: 'string' as const,
    description:
      'Specify a different Chrome channel that should be used. The default is the stable channel version.',
    choices: ['stable', 'canary', 'beta', 'dev'] as const,
    conflicts: ['browserUrl', 'executablePath'],
  },
  logFile: {
    type: 'string' as const,
    describe: 'Save the logs to file.',
    hidden: true,
  },
};

function readPackageJson(): {version?: string} {
  const currentDir = import.meta.dirname;
  const packageJsonPath = path.join(currentDir, '..', '..', 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }
  try {
    const json = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    assert.strict(json['name'], 'chrome-devtools-mcp');
    return json;
  } catch {
    return {};
  }
}

const version = readPackageJson().version ?? 'unknown';

const yargsInstance = yargs(hideBin(process.argv))
  .scriptName('npx chrome-devtools-mcp@latest')
  .options(cliOptions)
  .check(args => {
    // We can't set default in the options else
    // Yargs will complain
    if (!args.channel && !args.browserUrl) {
      args.channel = 'stable';
    }
    return true;
  })
  .example([
    [
      '$0 --browserUrl http://127.0.0.1:9222',
      'Connect to an existing browser instance',
    ],
    ['$0 --channel beta', 'Use Chrome Beta installed on this system'],
    ['$0 --channel canary', 'Use Chrome Canary installed on this system'],
    ['$0 --channel dev', 'Use Chrome Dev installed on this system'],
    ['$0 --channel stable', 'Use stable Chrome installed on this system'],
    ['$0 --logFile /tmp/log.txt', 'Save logs to a file'],
    ['$0 --help', 'Print CLI options'],
  ]);

export const args = yargsInstance
  .wrap(Math.min(120, yargsInstance.terminalWidth()))
  .help()
  .version(version)
  .parseSync();

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

logger(`Starting Chrome DevTools MCP Server v${version}`);
const server = new McpServer(
  {
    name: 'chrome_devtools',
    title: 'Chrome DevTools MCP server',
    version,
  },
  {capabilities: {logging: {}}},
);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

let context: McpContext;
async function getContext(): Promise<McpContext> {
  const browser = await resolveBrowser({
    browserUrl: args.browserUrl,
    headless: args.headless,
    executablePath: args.executablePath,
    customDevTools: args.customDevtools,
    channel: args.channel as Channel,
    isolated: args.isolated,
    logFile,
  });
  if (context?.browser !== browser) {
    context = await McpContext.from(browser, logger);
  }
  return context;
}

const logDisclaimers = () => {
  console.error(
    `chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do want to share with MCP clients.`,
  );
};

const toolMutex = new Mutex();

function registerTool(tool: ToolDefinition): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (params): Promise<CallToolResult> => {
      const guard = await toolMutex.acquire();
      try {
        logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
        const context = await getContext();
        const response = new McpResponse();
        await tool.handler(
          {
            params,
          },
          response,
          context,
        );
        try {
          const content = await response.handle(tool.name, context);
          return {
            content,
          };
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);

          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
            isError: true,
          };
        }
      } finally {
        guard.dispose();
      }
    },
  );
}

const tools = [
  ...Object.values(consoleTools),
  ...Object.values(emulationTools),
  ...Object.values(inputTools),
  ...Object.values(networkTools),
  ...Object.values(pagesTools),
  ...Object.values(performanceTools),
  ...Object.values(screenshotTools),
  ...Object.values(scriptTools),
  ...Object.values(snapshotTools),
];
for (const tool of tools) {
  registerTool(tool as unknown as ToolDefinition);
}

const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
logDisclaimers();
