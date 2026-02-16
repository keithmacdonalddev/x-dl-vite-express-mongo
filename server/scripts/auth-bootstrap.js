const readline = require('node:readline/promises');
const process = require('node:process');
const { getPersistentContext, closePersistentContext, getAdapterConfig } = require('../src/services/playwright-adapter');

async function main() {
  const config = getAdapterConfig();
  const context = await getPersistentContext();
  const page = await context.newPage();

  await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded' });

  console.log(`Opened persistent browser profile at: ${config.userDataDir}`);
  console.log('Log in manually in the opened browser window.');
  console.log('When login is complete and your feed loads, press Enter here to save session.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await rl.question('');
  rl.close();

  await page.close();
  await closePersistentContext();

  console.log('Session saved. You can now run background jobs with the same profile.');
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
