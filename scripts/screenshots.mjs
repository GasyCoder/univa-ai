import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = process.env.UNIVA_SCREENSHOT_DIR || '/tmp/univa-preview';
const baseURL = process.env.UNIVA_PREVIEW_URL || 'http://127.0.0.1:4200';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true,
});
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(baseURL);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${output}/landing-${theme}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Start for free', exact: true }).first().click();
      await page.getByRole('dialog').waitFor();
      await page.screenshot({ path: `${output}/auth-${theme}-${width}.png` });
      await page.keyboard.press('Escape');
    }
  }
  const response = await context.request.post(baseURL + '/api/auth/sign-up/email', {
    headers: { Origin: baseURL },
    data: {
      name: 'Preview account',
      email: `preview-${crypto.randomUUID()}@example.com`,
      password: 'PreviewTest123!',
    },
  });
  if (!response.ok()) throw new Error('Preview sign-up failed: ' + response.status());
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(baseURL + '/assistant');
      await page.locator('[data-ready=true]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${output}/assistant-${theme}-${width}.png` });
    }
  }
  console.log('Screenshots saved to ' + output);
} finally {
  await browser.close();
}
