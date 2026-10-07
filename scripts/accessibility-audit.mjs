import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const baseURL = process.env.UNIVA_PREVIEW_URL || 'http://127.0.0.1:4200';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
let failures = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  const page = await context.newPage();
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    for (const route of ['/', '/assistant']) {
      await page.goto(baseURL + route);
      if (route === '/assistant') await page.getByRole('dialog').waitFor();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      failures += result.violations.length;
      console.log(
        JSON.stringify(
          {
            route,
            theme,
            violations: result.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
            })),
          },
          null,
          2
        )
      );
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failures ? 1 : 0;
