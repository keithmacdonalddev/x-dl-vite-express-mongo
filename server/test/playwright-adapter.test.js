const test = require('node:test');
const assert = require('node:assert/strict');

test.afterEach(async () => {
  const { closePersistentContext } = require('../src/services/playwright-adapter');
  await closePersistentContext();
});

test('createPlaywrightPageFactory reuses one persistent browser context', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  let launchCount = 0;
  const createdPages = [];

  const fakeChromium = {
    launchPersistentContext: async () => {
      launchCount += 1;
      return {
        newPage: async () => {
          const handlers = new Map();
          const page = {
            on(event, handler) {
              handlers.set(event, handler);
            },
            off(event) {
              handlers.delete(event);
            },
            async goto() {
              const responseHandler = handlers.get('response');
              if (responseHandler) {
                responseHandler({ url: () => 'https://video.twimg.com/a.mp4' });
              }
            },
            async waitForTimeout() {},
            async title() {
              return 'X';
            },
            async content() {
              return '<html></html>';
            },
            async close() {
              this.closed = true;
            },
            closed: false,
          };
          createdPages.push(page);
          return page;
        },
        async close() {},
      };
    },
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
  });

  const first = await pageFactory();
  await first.goto('https://x.com/user/status/1');
  const firstUrls = await first.collectMediaUrls();
  await first.close();

  const second = await pageFactory();
  await second.goto('https://x.com/user/status/2');
  await second.close();

  assert.equal(launchCount, 1);
  assert.deepEqual(firstUrls, ['https://video.twimg.com/a.mp4']);
  assert.equal(createdPages.length, 2);
});

test('createPlaywrightPageFactory surfaces auth challenge states clearly', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  const fakeChromium = {
    launchPersistentContext: async () => ({
      newPage: async () => ({
        on() {},
        off() {},
        async goto() {},
        async waitForTimeout() {},
        async title() {
          return 'Log in to X / X';
        },
        async content() {
          return '<body>login required</body>';
        },
        async close() {},
      }),
      async close() {},
    }),
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
  });

  const page = await pageFactory();
  await assert.rejects(
    async () => page.goto('https://x.com/user/status/123'),
    /AUTH_REQUIRED/i
  );
});

test('createPlaywrightPageFactory does not treat TikTok login copy as auth wall', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  const fakeChromium = {
    launchPersistentContext: async () => ({
      newPage: async () => ({
        on() {},
        off() {},
        async goto() {},
        async waitForTimeout() {},
        async title() {
          return 'TikTok';
        },
        async content() {
          return '<body>Log in to follow creators, like videos, and view comments.</body>';
        },
        url() {
          return 'https://www.tiktok.com/@user/video/7606119826259512584';
        },
        async close() {},
      }),
      async close() {},
    }),
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
  });

  const page = await pageFactory();
  await page.goto('https://www.tiktok.com/@user/video/7606119826259512584');
  await page.close();
});

test('createPlaywrightPageFactory waits for manual TikTok challenge solve window', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  let sampleIndex = 0;
  const samples = [
    {
      title: 'Verify you are human',
      content: '<body>Performing security verification</body>',
      url: 'https://www.tiktok.com/@user/video/7606119826259512584',
    },
    {
      title: 'Verify you are human',
      content: '<body>Performing security verification</body>',
      url: 'https://www.tiktok.com/@user/video/7606119826259512584',
    },
    {
      title: 'TikTok',
      content: '<body>Video page ready</body>',
      url: 'https://www.tiktok.com/@user/video/7606119826259512584',
    },
  ];

  const fakeChromium = {
    launchPersistentContext: async () => ({
      newPage: async () => ({
        on() {},
        off() {},
        async goto() {},
        async waitForTimeout() {
          if (sampleIndex < samples.length - 1) {
            sampleIndex += 1;
          }
        },
        async title() {
          return samples[sampleIndex].title;
        },
        async content() {
          return samples[sampleIndex].content;
        },
        url() {
          return samples[sampleIndex].url;
        },
        async close() {},
      }),
      async close() {},
    }),
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
    manualSolveTimeoutMs: 3000,
    manualSolvePollMs: 10,
  });

  const page = await pageFactory();
  await page.goto('https://www.tiktok.com/@user/video/7606119826259512584');
  await page.close();
});

test('createPlaywrightPageFactory ignores captcha metadata when visible text is normal', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  const fakeChromium = {
    launchPersistentContext: async () => ({
      newPage: async () => ({
        on() {},
        off() {},
        async goto() {},
        async waitForTimeout() {},
        async title() {
          return 'TikTok';
        },
        locator() {
          return {
            async innerText() {
              return 'TikTok video page Log in Company Program Terms & Policies';
            },
          };
        },
        async content() {
          return '<script id=\"api-domains\" type=\"application/json\">{\"captcha\":\"\"}</script>';
        },
        url() {
          return 'https://www.tiktok.com/@user/video/7606119826259512584';
        },
        async close() {},
      }),
      async close() {},
    }),
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
    manualSolveTimeoutMs: 0,
  });

  const page = await pageFactory();
  await page.goto('https://www.tiktok.com/@user/video/7606119826259512584');
  await page.close();
});

test('createPlaywrightPageFactory relaunches context when cached context is closed', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  let launchCount = 0;

  const fakeChromium = {
    launchPersistentContext: async () => {
      launchCount += 1;

      if (launchCount === 1) {
        return {
          once() {},
          async close() {},
          async newPage() {
            throw new Error('Target page, context or browser has been closed');
          },
        };
      }

      return {
        once() {},
        async close() {},
        async newPage() {
          return {
            on() {},
            off() {},
            async goto() {},
            async waitForTimeout() {},
            async title() {
              return 'X';
            },
            async content() {
              return '<html></html>';
            },
            async close() {},
          };
        },
      };
    },
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
  });

  const page = await pageFactory();
  await page.goto('https://x.com/user/status/1');
  await page.close();

  assert.equal(launchCount, 2);
});

test('createPlaywrightPageFactory captures TikTok media URLs without file extension', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  const fakeChromium = {
    launchPersistentContext: async () => ({
      once() {},
      async newPage() {
        const handlers = new Map();
        return {
          on(event, handler) {
            handlers.set(event, handler);
          },
          off(event) {
            handlers.delete(event);
          },
          async goto() {
            const responseHandler = handlers.get('response');
            if (responseHandler) {
              responseHandler({
                url: () =>
                  'https://v19-webapp-prime.tiktok.com/video/tos/alisg/tos-alisg-pve-0037c001/o48THMGOIDCIRKOheIAAEoVLcLOFjemjgvej4X/?mime_type=video_mp4',
                headers: () => ({ 'content-type': 'video/mp4' }),
              });
            }
          },
          async waitForTimeout() {},
          async title() {
            return 'TikTok';
          },
          async content() {
            return '<html></html>';
          },
          async close() {},
        };
      },
      async close() {},
    }),
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
  });

  const page = await pageFactory();
  await page.goto('https://www.tiktok.com/@user/video/7606119826259512584');
  const mediaUrls = await page.collectMediaUrls();
  await page.close();

  assert.equal(mediaUrls.length, 1);
  assert.match(mediaUrls[0], /tiktok\.com\/video\/tos\//i);
});

test('createPlaywrightPageFactory retries launch when persistent profile lock crashes Chromium', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  let launchCount = 0;
  const fakeChromium = {
    launchPersistentContext: async () => {
      launchCount += 1;

      if (launchCount === 1) {
        throw new Error(
          'browserType.launchPersistentContext: Target page, context or browser has been closed (exitCode=21)'
        );
      }

      return {
        once() {},
        async close() {},
        async newPage() {
          return {
            on() {},
            off() {},
            async goto() {},
            async waitForTimeout() {},
            async title() {
              return 'TikTok';
            },
            locator() {
              return {
                async innerText() {
                  return 'Video page';
                },
              };
            },
            async content() {
              return '<html></html>';
            },
            url() {
              return 'https://www.tiktok.com/@user/video/7606119826259512584';
            },
            async close() {},
          };
        },
      };
    },
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
  });

  const page = await pageFactory();
  await page.goto('https://www.tiktok.com/@user/video/7606119826259512584');
  await page.close();

  assert.equal(launchCount, 2);
});

test('createPlaywrightPageFactory collects media URLs embedded in page content', async () => {
  const { createPlaywrightPageFactory } = require('../src/services/playwright-adapter');

  const fakeChromium = {
    launchPersistentContext: async () => ({
      once() {},
      async close() {},
      async newPage() {
        return {
          on() {},
          off() {},
          async goto() {},
          async waitForTimeout() {},
          async title() {
            return 'TikTok';
          },
          locator() {
            return {
              async innerText() {
                return 'Normal page';
              },
            };
          },
          async content() {
            return '<script>window.__DATA__={\"url\":\"https:\\\\u002F\\\\u002Fv16-webapp-prime.tiktok.com\\\\u002Fvideo\\\\u002Ftos\\\\u002Fabc?mime_type=video_mp4&br=3000\"};</script>';
          },
          url() {
            return 'https://www.tiktok.com/@user/video/7606119826259512584';
          },
          async close() {},
        };
      },
    }),
  };

  const pageFactory = createPlaywrightPageFactory({
    chromium: fakeChromium,
    userDataDir: '.tmp-tests',
    settleMs: 0,
  });

  const page = await pageFactory();
  await page.goto('https://www.tiktok.com/@user/video/7606119826259512584');
  const urls = await page.collectMediaUrls();
  await page.close();

  assert.equal(urls.length, 1);
  assert.match(urls[0], /video\/tos/i);
  assert.match(urls[0], /br=3000/i);
});
