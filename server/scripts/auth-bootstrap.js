const path = require('node:path');
const readline = require('node:readline/promises');
const process = require('node:process');
const dotenv = require('dotenv');
const { getPersistentContext, closePersistentContext, getAdapterConfig } = require('../src/services/playwright-adapter');
const { PLATFORMS } = require('../src/core/platforms/registry');
const { AUTH_CONFIG } = require('../src/core/config/auth-config');

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

  const platformArg = (process.argv[2] || '').toLowerCase().trim();

  // Validate platform argument
  const validIds = PLATFORMS.map((p) => p.id);

  // No args -> print usage and exit 0 (not error)
  if (!platformArg) {
    console.log('Usage: node scripts/auth-bootstrap.js <platform>');
    console.log(`Available platforms: ${validIds.join(', ')}`);
    console.log('');
    console.log('Examples:');
    for (const id of validIds) {
      console.log(`  npm run auth:${id}`);
    }
    process.exit(0);
  }

  if (!validIds.includes(platformArg)) {
    console.error(`Unknown platform: ${platformArg}`);
    console.log(`Available platforms: ${validIds.join(', ')}`);
    process.exit(1);
  }

  const authConfig = AUTH_CONFIG[platformArg];
  if (!authConfig || !authConfig.loginUrl) {
    console.error(`No login URL configured for platform: ${platformArg}`);
    process.exit(1);
  }

  const platformDef = PLATFORMS.find((p) => p.id === platformArg);
  const label = platformDef ? platformDef.label : platformArg;

  const adapterOptions = {};
  // Auth bootstrap is a manual flow; if headless isn't explicitly set, force headed browser.
  if (typeof process.env.PLAYWRIGHT_HEADLESS !== 'string') {
    adapterOptions.headless = false;
  }

  const config = getAdapterConfig(adapterOptions);
  const context = await getPersistentContext(adapterOptions);
  const page = await context.newPage();

  await page.goto(authConfig.loginUrl, { waitUntil: 'domcontentloaded' });

  console.log(`Opened persistent browser profile at: ${config.userDataDir}`);
  console.log(`Log in to ${label} manually in the opened browser window.`);
  console.log('When login is complete and your feed loads, press Enter here to save session.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await rl.question('');
  rl.close();

  await page.close();
  await closePersistentContext();

  console.log(`${label} session saved. You can now run background jobs with the same profile.`);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Auth bootstrap failed: ${message}`);
  try {
    await closePersistentContext();
  } catch {
    // ignore close failures on bootstrap exit
  }
  process.exit(1);
});
