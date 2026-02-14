import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5174';
const outDir = process.env.OUT_DIR || 'screenshots';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/01-dashboard.png`, fullPage: true });

  // Click first school card if present
  const first = page.locator('aside button').first();
  if (await first.count()) {
    await first.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/02-selected-school.png`, fullPage: true });
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
