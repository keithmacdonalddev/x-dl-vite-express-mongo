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
