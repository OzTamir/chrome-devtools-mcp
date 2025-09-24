/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it } from 'node:test';
import assert from 'assert';

import { getMockRequest, html, withBrowser } from './utils.js';

describe('McpResponse', () => {
  it('list pages', async () => {
    await withBrowser(async (response, context) => {
      response.setIncludePages(true);
      const result = await response.handle('test', context);
      assert.equal(result[0].type, 'text');
      assert.deepStrictEqual(
        result[0].text,
        `# test response
## Pages
0: about:blank [selected]`,
      );
    });
  });

  it('allows response text lines to be added', async () => {
    await withBrowser(async (response, context) => {
      response.appendResponseLine('Testing 1');
      response.appendResponseLine('Testing 2');
      const result = await response.handle('test', context);
      assert.equal(result[0].type, 'text');
      assert.deepStrictEqual(
        result[0].text,
        `# test response
Testing 1
Testing 2`,
      );
    });
  });

  it('does not include anything in response if snapshot is null', async () => {
    await withBrowser(async (response, context) => {
      const page = context.getSelectedPage();
      page.accessibility.snapshot = async () => null;
      const result = await response.handle('test', context);
      assert.equal(result[0].type, 'text');
      assert.deepStrictEqual(result[0].text, `# test response`);
    });
  });

  it('returns correctly formatted snapshot for a simple tree', async () => {
    await withBrowser(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(`<!DOCTYPE html>
<button>Click me</button><input type="text" value="Input">`);
      await page.focus('button');
      response.setIncludeSnapshot(true);
      const result = await response.handle('test', context);
      assert.equal(result[0].type, 'text');
      assert.strictEqual(
        result[0].text,
        `# test response
## Page content
uid=1_0 RootWebArea ""
  uid=1_1 button "Click me" focusable focused
  uid=1_2 textbox "" value="Input"
`,
      );
    });
  });

  it('returns values for textboxes', async () => {
    await withBrowser(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(
        html`<label
          >username<input
            name="username"
            value="mcp"
        /></label>`,
      );
      await page.focus('input');
      response.setIncludeSnapshot(true);
      const result = await response.handle('test', context);
      assert.equal(result[0].type, 'text');
      assert.strictEqual(
        result[0].text,
        `# test response
## Page content
uid=1_0 RootWebArea "My test page"
  uid=1_1 StaticText "username"
  uid=1_2 textbox "username" value="mcp" focusable focused
`,
      );
    });
  });

  it('adds throttling setting when it is not null', async () => {
    await withBrowser(async (response, context) => {
      context.setNetworkConditions('Slow 3G');
      const result = await response.handle('test', context);
      assert.equal(result[0].type, 'text');
      assert.strictEqual(
        result[0].text,
        `# test response
## Network emulation
Emulating: Slow 3G
Navigation timeout set to 100000 ms`,
      );
    });
  });

  it('does not include throttling setting when it is null', async () => {
    await withBrowser(async (response, context) => {
      const result = await response.handle('test', context);
      context.setNetworkConditions(null);
      assert.equal(result[0].type, 'text');
      assert.strictEqual(result[0].text, `# test response`);
    });
  });
  it('adds image when image is attached', async () => {
    await withBrowser(async (response, context) => {
      response.attachImage({ data: 'imageBase64', mimeType: 'image/png' });
      const result = await response.handle('test', context);
      assert.strictEqual(result[0].text, `# test response`);
      assert.equal(result[1].type, 'image');
      assert.strictEqual(result[1].data, 'imageBase64');
      assert.strictEqual(result[1].mimeType, 'image/png');
    });
  });

  it('adds cpu throttling setting when it is over 1', async () => {
    await withBrowser(async (response, context) => {
      context.setCpuThrottlingRate(4);
      const result = await response.handle('test', context);
      assert.strictEqual(
        result[0].text,
        `# test response
## CPU emulation
Emulating: 4x slowdown`,
      );
    });
  });

  it('does not include cpu throttling setting when it is 1', async () => {
    await withBrowser(async (response, context) => {
      context.setCpuThrottlingRate(1);
      const result = await response.handle('test', context);
      assert.strictEqual(result[0].text, `# test response`);
    });
  });

  it('adds a dialog', async () => {
    await withBrowser(async (response, context) => {
      const page = context.getSelectedPage();
      const dialogPromise = new Promise<void>(resolve => {
        page.on('dialog', () => {
          resolve();
        });
      });
      page.evaluate(() => {
        alert('test');
      });
      await dialogPromise;
      const result = await response.handle('test', context);
      await context.getDialog()?.dismiss();
      assert.strictEqual(
        result[0].text,
        `# test response
# Open dialog
alert: test (default value: test).
Call browser_handle_dialog to handle it before continuing.`,
      );
    });
  });

  it('add network requests when setting is true', async () => {
    await withBrowser(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getNetworkRequests = () => {
        return [getMockRequest()];
      };
      const result = await response.handle('test', context);
      const text = result[0].text as string;
      assert.ok(
        text.includes(`## Network requests`),
      );
      assert.ok(text.includes('http://example.com GET [pending]'));
    });
  });
  it('does not include network requests when setting is false', async () => {
    await withBrowser(async (response, context) => {
      response.setIncludeNetworkRequests(false);
      context.getNetworkRequests = () => {
        return [getMockRequest()];
      };
      const result = await response.handle('test', context);
      assert.strictEqual(result[0].text, `# test response`);
    });
  });

  it('add network request when attached', async () => {
    await withBrowser(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      const request = getMockRequest();
      context.getNetworkRequests = () => {
        return [request];
      };
      response.attachNetworkRequest(request.url());
      const result = await response.handle('test', context);
      assert.strictEqual(
        result[0].text,
        `# test response
## Request http://example.com
Status:  [pending]
### Request Headers
- content-size:10
## Network requests
Showing 1-1 of 1.
http://example.com GET [pending]`,
      );
    });
  });

  it('adds console messages when the setting is true', async () => {
    await withBrowser(async (response, context) => {
      response.setIncludeConsoleData(true);
      const page = context.getSelectedPage();
      const consoleMessagePromise = new Promise<void>(resolve => {
        page.on('console', () => {
          resolve();
        });
      });
      page.evaluate(() => {
        console.log('Hello from the test');
      });
      await consoleMessagePromise;
      const result = await response.handle('test', context);
      assert.ok(result[0].text);
      // Cannot check the full text because it contains local file path
      assert.ok(
        result[0].text.toString().startsWith(`# test response
## Console messages
Log>`),
      );
      assert.ok(result[0].text.toString().includes('Hello from the test'));
    });
  });

  it('adds a message when no console messages exist', async () => {
    await withBrowser(async (response, context) => {
      response.setIncludeConsoleData(true);
      const result = await response.handle('test', context);
      assert.ok(result[0].text);
      assert.strictEqual(
        result[0].text.toString(),
        `# test response
## Console messages
<no console messages found>`,
      );
    });
  });
});

describe('McpResponse network pagination', () => {
  it('returns all requests when pagination is not provided', async () => {
    await withBrowser(async (response, context) => {
      const requests = Array.from({ length: 5 }, (_, idx) =>
        getMockRequest({ method: `GET-${idx}` }),
      );
      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true);
      const result = await response.handle('test', context);
      const text = (result[0].text as string).toString();
      assert.ok(text.includes('Showing 1-5 of 5.'));
      assert.ok(!text.includes('Next:'));
      assert.ok(!text.includes('Prev:'));
    });
  });

  it('returns first page by default', async () => {
    await withBrowser(async (response, context) => {
      const requests = Array.from({ length: 30 }, (_, idx) =>
        getMockRequest({ method: `GET-${idx}` }),
      );
      context.getNetworkRequests = () => {
        return requests;
      };
      response.setIncludeNetworkRequests(true, { pageSize: 10 });
      const result = await response.handle('test', context);
      const text = (result[0].text as string).toString();
      assert.ok(text.includes('Showing 1-10 of 30.'));
      assert.ok(text.includes('Next: 10'));
      assert.ok(!text.includes('Prev:'));
    });
  });

  it('returns subsequent page when token provided', async () => {
    await withBrowser(async (response, context) => {
      const requests = Array.from({ length: 25 }, (_, idx) =>
        getMockRequest({ method: `GET-${idx}` }),
      );
      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        pageSize: 10,
        pageToken: '10',
      });
      const result = await response.handle('test', context);
      const text = (result[0].text as string).toString();
      assert.ok(text.includes('Showing 11-20 of 25.'));
      assert.ok(text.includes('Next: 20'));
      assert.ok(text.includes('Prev: 0'));
    });
  });

  it('handles invalid token by showing first page', async () => {
    await withBrowser(async (response, context) => {
      const requests = Array.from({ length: 5 }, (_, idx) =>
        getMockRequest({ method: `GET-${idx}` }),
      );
      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        pageSize: 2,
        pageToken: 'invalid',
      });
      const result = await response.handle('test', context);
      const text = (result[0].text as string).toString();
      assert.ok(
        text.includes('Invalid page token provided. Showing first page.'),
      );
      assert.ok(text.includes('Showing 1-2 of 5.'));
    });
  });
});

describe('McpResponse network filtering', () => {
  it('filters requests by provided type', async () => {
    await withBrowser(async (response, context) => {
      const requests = [
        getMockRequest({
          resourceType: 'document',
          method: 'GET',
          url: 'https://example.com/document',
        }),
        getMockRequest({
          resourceType: 'image',
          method: 'GET',
          url: 'https://example.com/image.png',
        }),
        getMockRequest({
          resourceType: 'xhr',
          method: 'GET',
          url: 'https://example.com/api',
        }),
      ];

      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        requestType: 'image',
      });

      const result = await response.handle('test', context);
      const text = result[0].text as string;

      assert.ok(text.includes('Filtered by type: image'));
      assert.ok(text.includes('Showing 1-1 of 1.'));
      assert.ok(text.includes('https://example.com/image.png'));
      assert.ok(!text.includes('https://example.com/document'));
      assert.ok(!text.includes('https://example.com/api'));
    });
  });

  it('supports array request type filters', async () => {
    await withBrowser(async (response, context) => {
      const requests = [
        getMockRequest({
          resourceType: 'document',
          method: 'GET',
          url: 'https://example.com/document',
        }),
        getMockRequest({
          resourceType: 'image',
          method: 'GET',
          url: 'https://example.com/image.png',
        }),
        getMockRequest({
          resourceType: 'script',
          method: 'GET',
          url: 'https://example.com/script.js',
        }),
      ];

      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        requestType: ['image', 'script'],
      });

      const result = await response.handle('test', context);
      const text = result[0].text as string;

      assert.ok(text.includes('Filtered by type: image, script'));
      assert.ok(text.includes('Showing 1-2 of 2.'));
      assert.ok(text.includes('https://example.com/image.png'));
      assert.ok(text.includes('https://example.com/script.js'));
      assert.ok(!text.includes('https://example.com/document'));
    });
  });

  it('returns message when no matching requests exist', async () => {
    await withBrowser(async (response, context) => {
      const requests = [
        getMockRequest({
          resourceType: 'document',
          url: 'https://example.com/document',
        }),
      ];

      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        requestType: 'image',
      });

      const result = await response.handle('test', context);
      const text = result[0].text as string;

      assert.ok(text.includes('Filtered by type: image'));
      assert.ok(text.includes('No requests found for the selected type(s).'));
    });
  });
});
