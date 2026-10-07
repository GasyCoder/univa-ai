import { test as base, expect, type Page, type Cookie } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const baseURL = `http://127.0.0.1:${process.env.UNIVA_TEST_PORT || '4200'}`;
const test = base.extend<{}, { account: { id: string; cookies: Cookie[] } }>({
  account: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: { Origin: baseURL },
      });
      const response = await request.post('/api/auth/sign-up/email', {
        data: {
          name: 'Workspace Tester',
          email: `univa-${crypto.randomUUID()}@gmail.com`,
          password: 'WorkspaceTest123!',
        },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const result = await response.json();
      await use({ id: result.user.id, cookies: (await request.storageState()).cookies });
      await request.dispose();
    },
    { scope: 'worker' },
  ],
});
async function workspace(page: Page, cookies: Cookie[]) {
  await page.context().addCookies(cookies);
  await page.goto('/assistant');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
}

for (const [width, height] of [
  [320, 650],
  [586, 750],
  [768, 900],
  [1440, 900],
]) {
  test(`register and login dialogs stay centered at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const opener = page.getByRole('button', { name: 'Start for free', exact: true }).first();
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const mode of ['Register', 'Log in']) {
      await dialog.getByRole('tab', { name: mode, exact: true }).click();
      const box = (await dialog.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
      expect(Math.abs(box.y + box.height / 2 - height / 2)).toBeLessThan(2);
      expect(box.height).toBeLessThanOrEqual(height - 30);
      await expect(dialog.locator('input[aria-invalid="true"]')).toHaveCount(0);
      await expect(dialog.getByLabel('Email', { exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });
}

test('assistant requires an authenticated server session', async ({ page }) => {
  await page.goto('/assistant?role=2&prompt=Preserve%20this%20question');
  await expect(page.getByRole('dialog')).toContainText('Welcome back.');
  await expect(page.locator('#chat-input')).toHaveCount(0);
  const response = await page.request.post('/api/waitlist', { headers: { Origin: baseURL } });
  expect(response.status()).toBe(401);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(baseURL + '/');
});

test('email registration, logout, wrong password, and login work', async ({ page }) => {
  const email = `account-${crypto.randomUUID()}@gmail.com`;
  const password = 'AccountTest123!';
  await page.goto('/assistant?role=2&prompt=Keep%20my%20question');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Register' }).click();
  await dialog.getByLabel('Full name').fill('Aina Test');
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Create free account' }).click();
  await expect(page.locator('#chat-input')).toHaveValue('Keep my question');
  await expect(page.locator('#chat-role')).toContainText('Researcher');
  await expect(page.locator('.chat-profile').first()).toContainText('Aina Test');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#chat-input')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('[data-slot=alert]')).toContainText('Check your email and password');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.locator('#chat-input')).toHaveValue('Keep my question');
});

test('assistant links open a separate window and preserve role and prompt', async ({
  page,
  account,
}) => {
  await page.context().addCookies(account.cookies);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  const links = await page
    .locator('a[href^="/assistant"]')
    .evaluateAll((items) =>
      items.map((a) => ({ target: a.getAttribute('target'), rel: a.getAttribute('rel') }))
    );
  expect(links.length).toBeGreaterThan(1);
  for (const link of links) {
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  }
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Try a research prompt' }).click();
  const popup = await opened;
  await expect(popup.locator('#chat-role')).toContainText('Researcher');
  await expect(popup.locator('#chat-input')).toHaveValue(/urban biodiversity/);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await expect(page).toHaveURL(baseURL + '/');
  await popup.close();
});

for (const width of [320, 390, 768, 1440]) {
  test(`English pages and workspace fit ${width}px`, async ({ page, account }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    const missing = await page
      .locator('a[href^="#"]')
      .evaluateAll((items) =>
        items
          .map((a) => a.getAttribute('href')!)
          .filter((href) => !document.getElementById(href.slice(1)))
      );
    expect(missing).toEqual([]);
    if (width < 800) {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(page.getByRole('dialog', { name: 'Explore UNUVIA' })).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await workspace(page, account.cookies);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    await expect(page.getByRole('heading', { name: 'What’s on your mind?' })).toBeVisible();
    if (width < 768) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.locator('#mobile-chat-sidebar')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    expect(errors).toEqual([]);
  });
}

test('light and dark preference persists across pages and reload', async ({ page, account }) => {
  await page.context().addCookies(account.cookies);
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle light or dark mode' }).first().click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.goto('/assistant');
  await expect(page.locator('[data-ready=true]')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Toggle light or dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
});

test('pricing shows planned offers and waitlist is authenticated and idempotent', async ({
  page,
  account,
}) => {
  await page.context().addCookies(account.cookies);
  await page.goto('/');
  await expect(page.locator('#pricing')).toContainText('$12');
  await expect(page.locator('#pricing')).toContainText('No payment collected.');
  await page.getByRole('button', { name: 'Join Pro waitlist' }).click();
  await expect(page.getByRole('status')).toContainText('You’re on the Pro waitlist');
  await page.getByRole('button', { name: 'Join Pro waitlist' }).click();
  await expect(page.getByRole('status')).toContainText('No payment required');
  expect(
    (
      await page.request.post('/api/waitlist', { headers: { Origin: 'https://untrusted.example' } })
    ).status()
  ).toBe(403);
});

test('unavailable Google provider is explicit and email remains usable', async ({ page }) => {
  await page.route('**/api/auth-config', (route) =>
    route.fulfill({ json: { googleEnabled: false } })
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Start for free', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('Continue with email');
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
});

test('all models are selectable and sent using their API identifiers', async ({
  page,
  account,
}) => {
  await page.addInitScript(() => {
    window.claude = { complete: async (request) => 'Selected model: ' + request.model };
  });
  await workspace(page, account.cookies);
  for (const [label, id] of [
    ['Claude Opus 5.5', 'claude-opus-5-5'],
    ['Claude Sonnet 5.5', 'claude-sonnet-5-5'],
    ['Claude Fable 5.1', 'claude-fable-5-1'],
    ['Claude Haiku 4.5', 'claude-haiku-4-5'],
  ]) {
    await page.locator('#chat-model').click();
    await page.getByRole('option', { name: label }).click();
    await page.locator('#chat-input').fill('Explain an idea');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.markdown-content').last()).toContainText(id);
  }
});

test('missing model service preserves prompt and attached file', async ({ page, account }) => {
  await workspace(page, account.cookies);
  await page.locator('#chat-input').fill('Summarize my notes');
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Project notes'),
  });
  await expect(page.locator('.attachment-pill')).toContainText('notes.md');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('[data-slot=alert]')).toContainText('currently unavailable');
  await expect(page.locator('#chat-input')).toHaveValue('Summarize my notes');
  await expect(page.locator('.attachment-pill')).toContainText('notes.md');
  await page.getByRole('button', { name: 'Remove attachment' }).click();
  await expect(page.locator('.attachment-pill')).toHaveCount(0);
});

test('history is isolated from legacy storage and from a different account', async ({
  page,
  account,
}) => {
  await page.addInitScript(
    ({ id }) => {
      const payload = JSON.stringify({
        chats: [
          {
            id: 'secret',
            title: 'Private previous account',
            messages: [{ role: 'user', content: 'Private note' }],
          },
        ],
        role: 'Student',
        model: 'claude-opus-5-5',
      });
      localStorage.setItem('univa-chats-v1', payload);
      localStorage.setItem('univa-chats-v2:other-user', payload);
      localStorage.setItem(
        'univa-chats-v2:' + id,
        JSON.stringify({ chats: [], role: 'Faculty', model: 'claude-sonnet-5-5' })
      );
    },
    { id: account.id }
  );
  await workspace(page, account.cookies);
  await expect(page.locator('.history-item')).toHaveCount(0);
  await expect(page.getByText('Private previous account')).toHaveCount(0);
});

test('markdown is safe and failed requests can be retried', async ({ page, account }) => {
  await page.addInitScript(() => {
    let calls = 0;
    window.claude = {
      complete: async () => {
        if (!calls++) throw new Error('429');
        return '**Verified response**\n<script>window.hacked=true</script>\n[unsafe](javascript:alert(1))';
      },
    };
  });
  await workspace(page, account.cookies);
  await page.locator('#chat-input').fill('A useful question');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('[data-slot=alert]')).toContainText('Too many requests');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.markdown-content strong')).toHaveText('Verified response');
  await expect(page.locator('.markdown-content script')).toHaveCount(0);
  await expect(page.locator('.markdown-content a[href^="javascript:"]')).toHaveCount(0);
});

for (const mode of ['light', 'dark']) {
  test(`accessible landing, auth, workspace, and model picker in ${mode} mode`, async ({
    page,
    account,
  }) => {
    await page.addInitScript((theme) => localStorage.setItem('theme', theme), mode);
    await page.goto('/');
    const audit = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))
      ).toEqual([]);
    };
    await audit();
    await page.getByRole('button', { name: 'Start for free', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit();
    await page.keyboard.press('Escape');
    await workspace(page, account.cookies);
    await audit();
    await page.locator('#chat-model').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await audit();
  });
}
