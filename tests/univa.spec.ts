import { test as base, expect, type Page, type Cookie } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const baseURL = `http://127.0.0.1:${process.env.UNIVA_TEST_PORT || '4200'}`;
const test = base.extend<{}, { account: { id: string; cookies: Cookie[] } }>({
  account: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: {
          Origin: baseURL,
          'x-forwarded-for': `192.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
        },
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
      if (!process.env.UNIVA_TEST_SERVER_MANAGED)
        throw new Error('Run npm run test:e2e to use isolated PostgreSQL fixtures.');
      const db = new Pool({ connectionString: process.env.DATABASE_URL });
      await db.query(
        "INSERT INTO subscription (user_id,plan,status,current_period_end) VALUES ($1,'pro','active',NOW()+INTERVAL '30 days')",
        [result.user.id]
      );
      await db.query(
        "INSERT INTO profile (user_id,default_model,theme) VALUES ($1,'claude-sonnet-5-5','light')",
        [result.user.id]
      );
      await db.end();
      await use({ id: result.user.id, cookies: (await request.storageState()).cookies });
      await request.dispose();
    },
    { scope: 'worker' },
  ],
});
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
  });
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
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Log in.', exact: true })
  ).toBeVisible();
  await expect(page.locator('#chat-input')).toHaveCount(0);
  const response = await page.request.get('/api/account');
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
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out', exact: true }).click();
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

for (const width of [320, 360, 390, 768, 1024, 1440]) {
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
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(page.getByRole('dialog', { name: 'Explore UNUVIA' })).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await workspace(page, account.cookies);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    await expect(page.getByRole('heading', { name: 'What are you working on?' })).toBeVisible();
    if (width < 1024) {
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

test.describe('mobile touch interactions', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 568 } });

  test('navigation, use cases and registration remain usable on short screens', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const bottomNav = page.getByRole('navigation', { name: 'Mobile site navigation' });
      const navBefore = (await bottomNav.boundingBox())!;
      expect(Math.abs(navBefore.y + navBefore.height - viewport.height)).toBeLessThan(2);
      const menu = page.getByRole('button', { name: 'Open menu' });
      expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await menu.tap();
      const sheet = page.getByRole('dialog', { name: 'Explore UNUVIA' });
      await sheet.getByRole('link', { name: 'Pricing', exact: true }).tap();
      await expect(sheet).toBeHidden();
      await expect(page.locator('#pricing')).toBeInViewport();
      expect((await bottomNav.boundingBox())!.y).toBeCloseTo(navBefore.y, 1);
      const research = page.getByRole('tab', { name: 'Research', exact: true });
      await research.tap();
      await expect(page.getByRole('tabpanel')).toContainText('Organize your research.');
      await expect(page.getByRole('link', { name: 'Try a research prompt' })).toHaveAttribute(
        'target',
        '_blank'
      );
      expect((await research.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.getByRole('button', { name: 'Start for free', exact: true }).first().tap();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Full name').fill('Mobile visitor');
      await dialog.getByLabel('Email', { exact: true }).fill('mobile@example.com');
      await dialog.getByLabel('Password', { exact: true }).fill('MobileTest123!');
      await page.setViewportSize({ width: viewport.width, height: 320 });
      const submit = dialog.getByRole('button', { name: 'Create free account' });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue('mobile@example.com');
      const box = (await dialog.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(12);
      expect(box.y + box.height).toBeLessThanOrEqual(308);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width
      );
      await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(dialog).toBeHidden();
    }
  });

  test('workspace supports touch controls, multiline input and model selection', async ({
    page,
    account,
  }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await workspace(page, account.cookies);
      const bottomNav = page.getByRole('navigation', { name: 'Mobile workspace navigation' });
      const navBox = (await bottomNav.boundingBox())!;
      expect(Math.abs(navBox.y + navBox.height - viewport.height)).toBeLessThan(2);
      await page.locator('#chat-role').tap();
      await page.getByRole('option', { name: 'Researcher', exact: true }).tap();
      const input = page.getByLabel('Your question for UNUVIA');
      await input.fill('A research question');
      await input.press('End');
      await input.press('Enter');
      await expect(input).toHaveValue('A research question\n');
      for (const control of [
        page.locator('#chat-model'),
        page.getByRole('button', { name: 'Add files and more' }),
        page.getByRole('button', { name: 'Send message' }),
      ]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.locator('#chat-model').tap();
      const picker = page.getByRole('menu');
      await expect(picker).toBeInViewport();
      await page.getByRole('menuitemradio', { name: /^Claude Opus 5\.5/ }).tap();
      await expect(page.locator('#chat-model')).toContainText('Claude Opus 5.5');
      await expect(input).toHaveValue('A research question\n');
      await expect(picker).toBeHidden();
      await page.locator('#chat-model').focus();
      await expect(page.locator('#chat-model')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitemradio', { name: /^Claude Sonnet 5\.5/ })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitemradio', { name: /^Claude Opus 5\.5/ })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitemradio', { name: /^Claude Fable 5\.1/ })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#chat-model')).toContainText('Claude Fable 5.1');
      await page.getByRole('button', { name: 'Open navigation' }).tap();
      await page
        .locator('#mobile-chat-sidebar')
        .getByRole('button', { name: 'New conversation' })
        .tap();
      await expect(page.locator('#mobile-chat-sidebar')).toBeHidden();
      await expect(input).toHaveValue('');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width
      );
    }
  });
});

test('pricing opens subscription settings and account writes reject foreign origins', async ({
  page,
  account,
}) => {
  await page.context().addCookies(account.cookies);
  await page.goto('/');
  await expect(page.locator('#pricing')).toContainText('$12');
  await expect(page.locator('#pricing')).toContainText('manual payment review');
  await page.getByRole('button', { name: 'Get Pro', exact: true }).click();
  await expect(page).toHaveURL(baseURL + '/account?tab=subscription');
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  expect(
    (
      await page.request.put('/api/account', {
        headers: { Origin: 'https://untrusted.example' },
        data: { name: 'Invalid change' },
      })
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

test('Google sign-in options can be retried and the provider request preserves the destination', async ({
  page,
}) => {
  let configUnavailable = true;
  await page.route('**/api/auth-config', (route) => {
    return configUnavailable
      ? route.fulfill({ status: 503, json: { error: 'Temporary failure' } })
      : route.fulfill({ json: { googleEnabled: true } });
  });
  await page.route('**/api/auth/sign-in/social', (route) =>
    route.fulfill({ status: 400, json: { code: 'TEST_PROVIDER_ERROR', message: 'Test error' } })
  );
  await page.goto('/assistant?role=2&prompt=Keep%20these%20notes');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Couldn’t load Google sign-in.');
  await expect(dialog.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  configUnavailable = false;
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  const google = dialog.getByRole('button', { name: 'Continue with Google' });
  await expect(google).toBeEnabled();
  const request = page.waitForRequest('**/api/auth/sign-in/social');
  await google.click();
  expect((await request).postDataJSON()).toMatchObject({
    provider: 'google',
    callbackURL: '/assistant?role=2&prompt=Keep%20these%20notes',
  });
  await expect(dialog.getByRole('alert')).toContainText('Google sign-in could not start');
  await expect(dialog.getByLabel('Email', { exact: true })).toBeEnabled();
  await expect(google).toBeEnabled();
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
    ['Claude Haiku 5.5', 'claude-haiku-5-5'],
  ]) {
    await page.locator('#chat-model').click();
    await page.getByRole('menuitemradio', { name: label }).click();
    await page.locator('#chat-input').fill('Explain an idea');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.markdown-content').last()).toContainText(id);
  }
});

test('missing model service preserves prompt and attached file', async ({ page, account }) => {
  await page.route('**/api/assistant', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'not_configured' } } })
  );
  await workspace(page, account.cookies);
  await page.locator('#chat-input').fill('Summarize my notes');
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Project notes'),
  });
  await expect(page.locator('.attachment-pill')).toContainText('notes.md');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('isn’t connected yet');
  await expect(page.locator('#chat-input')).toHaveValue('Summarize my notes');
  await expect(page.locator('.attachment-pill')).toContainText('notes.md');
  await page.getByRole('button', { name: 'Remove attachment' }).click();
  await expect(page.locator('.attachment-pill')).toHaveCount(0);
});

test('documents and images are read as text before sending', async ({ page, account }) => {
  test.setTimeout(180000);
  let body = '';
  await page.route('**/api/assistant', (route) => {
    body = route.request().postData() ?? '';
    return route.fulfill({ status: 503, json: { error: { code: 'not_configured' } } });
  });
  await workspace(page, account.cookies);
  const cases: [string, RegExp][] = [
    ['t.docx', /Texte DOCX reussi/],
    ['text.pdf', /Hello PDF text layer works/],
    ['scan.pdf', /Bonjour UNIVA/],
    ['t.png', /Bonjour UNIVA/],
  ];
  for (const [name, pattern] of cases) {
    await page.locator('input[type=file]').setInputFiles(`tests/fixtures/${name}`);
    await expect(page.locator('.attachment-pill')).toContainText(name, { timeout: 120000 });
    await page.locator('#chat-input').fill('Summarize');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => body).toMatch(pattern);
    await expect(page.locator('[data-sonner-toast]')).toBeVisible();
    await page.getByRole('button', { name: 'Remove attachment' }).click();
  }
});

test('a long document is truncated, not refused', async ({ page, account }) => {
  await workspace(page, account.cookies);
  await page.locator('input[type=file]').setInputFiles({
    name: 'long.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('word '.repeat(60000)),
  });
  await expect(page.locator('.attachment-pill')).toContainText('truncated to fit');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

test('a file dropped anywhere on the window is attached', async ({ page, account }) => {
  await workspace(page, account.cookies);
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['Dropped notes'], 'dropped.md', { type: 'text/markdown' }));
    return dt;
  });
  await page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await expect(page.locator('.window-drop-overlay')).toBeVisible();
  await page.dispatchEvent('body', 'drop', { dataTransfer });
  await expect(page.locator('.window-drop-overlay')).toHaveCount(0);
  await expect(page.locator('.attachment-pill')).toContainText('dropped.md');
});

test('the + menu adds a file from Google Drive', async ({ page, account }) => {
  let connected = false;
  await page.route('**/api/auth-config', (route) =>
    route.fulfill({ json: { googleEnabled: true } })
  );
  await page.route('**/api/drive/files?**', (route) =>
    route.fulfill({
      json: connected
        ? {
            connected: true,
            files: [
              {
                id: 'doc-1234567890',
                name: 'Rapport de stage',
                mimeType: 'application/vnd.google-apps.document',
                modifiedTime: '2026-10-01T10:00:00Z',
              },
            ],
          }
        : { connected: false },
    })
  );
  await page.route('**/api/drive/files/doc-1234567890', (route) =>
    route.fulfill({
      body: 'Contenu du rapport',
      headers: { 'X-File-Name': encodeURIComponent('Rapport de stage.txt') },
    })
  );
  await workspace(page, account.cookies);
  await page.getByRole('button', { name: 'Add files and more' }).click();
  await expect(page.getByRole('menuitem', { name: /Files or images/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Google Drive/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Google Drive' });
  await expect(dialog.getByRole('button', { name: 'Connect Google Drive' })).toBeVisible();
  connected = true;
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add files and more' }).click();
  await page.getByRole('menuitem', { name: /Google Drive/ }).click();
  await dialog.getByRole('button', { name: /Rapport de stage/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.attachment-pill')).toContainText('Rapport de stage.txt');
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
  await expect(page.locator('[data-sonner-toast]')).toContainText('Too many requests');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.markdown-content strong')).toHaveText('Verified response');
  await expect(page.locator('.markdown-content script')).toHaveCount(0);
  await expect(page.locator('.markdown-content a[href^="javascript:"]')).toHaveCount(0);
});

for (const [width, mode] of [
  [1440, 'light'],
  [1440, 'dark'],
  [320, 'light'],
  [390, 'dark'],
] as const) {
  test(`sidebar search, rename, safe deletion and account menu work at ${width}px in ${mode}`, async ({
    page,
    account,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      ({ id, mode }) => {
        localStorage.setItem('theme', mode);
        const key = 'univa-chats-v2:' + id;
        if (!localStorage.getItem(key))
          localStorage.setItem(
            key,
            JSON.stringify({
              role: 'Researcher',
              model: 'claude-sonnet-5-5',
              chats: [
                {
                  id: 'notes',
                  title: 'Biology lecture notes',
                  messages: [{ role: 'user', content: 'Review my lecture notes.' }],
                },
                {
                  id: 'research',
                  title: 'Méthodes de recherche',
                  messages: [{ role: 'user', content: 'Review my methods.' }],
                },
                {
                  id: 'outline',
                  title:
                    'A very long conversation title about preparing a university research outline and organizing references',
                  messages: [{ role: 'user', content: 'Prepare an outline.' }],
                },
              ],
            })
          );
      },
      { id: account.id, mode }
    );
    await page.context().addCookies(account.cookies);
    await page.request.put('/api/account', { headers: { Origin: baseURL }, data: { theme: mode } });
    await workspace(page, account.cookies);
    const sidebar = page.locator(width < 1024 ? '#mobile-chat-sidebar' : '#chat-sidebar');
    const openMobile = async () => {
      if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
    };
    await openMobile();
    const audit = async () => {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        }))
      ).toEqual([]);
    };
    await expect(sidebar.locator('.history-item')).toHaveCount(3);
    const search = sidebar.getByRole('searchbox', { name: 'Search conversations' });
    await search.fill('METHODES');
    await expect(sidebar.locator('.history-item')).toHaveCount(1);
    await expect(sidebar.locator('.history-item')).toContainText('Méthodes de recherche');
    await search.fill('missing conversation');
    await expect(sidebar.getByText('No matching conversations')).toBeVisible();
    await sidebar.getByRole('button', { name: 'Clear search', exact: true }).first().click();
    await expect(search).toBeFocused();
    await expect(sidebar.locator('.history-item')).toHaveCount(3);
    await sidebar
      .getByRole('button', { name: 'Conversation options for Biology lecture notes' })
      .click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    const rename = page.getByRole('dialog', { name: 'Rename conversation', exact: true });
    await expect(rename.getByLabel('Conversation name')).toBeFocused();
    await audit();
    await rename.getByLabel('Conversation name').fill('Week one notes');
    await rename.getByRole('button', { name: 'Save name' }).click();
    await expect(rename).toBeHidden();
    await expect(
      sidebar.getByRole('button', { name: 'Conversation options for Week one notes' })
    ).toBeFocused();
    await page.reload();
    await expect(page.locator('[data-ready=true]')).toBeVisible();
    await openMobile();
    await expect(
      sidebar.getByRole('button', { name: 'Open conversation Week one notes' })
    ).toBeVisible();
    await sidebar.getByRole('button', { name: 'Conversation options for Week one notes' }).click();
    await page.getByRole('menuitem', { name: 'Delete conversation', exact: true }).click();
    const deletion = page.getByRole('dialog', { name: 'Delete conversation?', exact: true });
    await expect(deletion.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await deletion.getByRole('button', { name: 'Cancel' }).click();
    await expect(sidebar.locator('.history-item')).toHaveCount(3);
    await sidebar.getByRole('button', { name: 'Conversation options for Week one notes' }).click();
    await page.getByRole('menuitem', { name: 'Delete conversation', exact: true }).click();
    await deletion.getByRole('button', { name: 'Delete conversation', exact: true }).click();
    await expect(deletion).toBeHidden();
    await expect(sidebar.locator('.history-item')).toHaveCount(2);
    await expect(sidebar.getByRole('button', { name: 'New conversation' })).toBeFocused();
    await sidebar.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menu')).toContainText('Workspace Tester');
    await expect(page.getByRole('menuitem', { name: 'Log out', exact: true })).toBeEnabled();
    await audit();
    await page.keyboard.press('Escape');
    await sidebar.getByRole('button', { name: 'Open conversation Méthodes de recherche' }).click();
    await expect(page.locator('.workspace-header-title')).toHaveText('Méthodes de recherche');
    await expect(page.locator('#chat-input')).toBeFocused();
    if (width < 1024) await expect(sidebar).toBeHidden();
    else {
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(80);
      await sidebar.getByRole('button', { name: 'Search conversations' }).click();
      await expect(search).toBeFocused();
      await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(288);
    }
    await openMobile();
    const longTitle =
      'A very long conversation title about preparing a university research outline and organizing references';
    await sidebar.getByRole('button', { name: `Open conversation ${longTitle}` }).click();
    await expect(page.locator('.workspace-header-title')).toHaveText(longTitle);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    await openMobile();
    await sidebar.getByRole('button', { name: `Conversation options for ${longTitle}` }).click();
    await page.getByRole('menuitem', { name: 'Delete conversation', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete conversation?', exact: true })
      .getByRole('button', { name: 'Delete conversation', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'What are you working on?' })).toBeVisible();
    await expect(page.locator('#chat-input')).toBeFocused();
  });
}

/** Replaces the assistant API with a text stream that arrives a few characters at a time. */
async function streamResponses(page: Page, answer: string, delay = 30, size = 24) {
  await page.addInitScript(
    ({ answer, delay, size }) => {
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (!String(input instanceof Request ? input.url : input).includes('/api/assistant'))
          return original(input, init);
        const encoder = new TextEncoder();
        const characters = Array.from(answer);
        let offset = 0;
        let timer: ReturnType<typeof setInterval>;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            timer = setInterval(() => {
              if (init?.signal?.aborted) {
                clearInterval(timer);
                controller.error(new DOMException('Aborted', 'AbortError'));
                return;
              }
              controller.enqueue(encoder.encode(characters.slice(offset, offset + size).join('')));
              offset += size;
              if (offset >= characters.length) {
                clearInterval(timer);
                controller.close();
              }
            }, delay);
          },
          cancel() {
            clearInterval(timer);
          },
        });
        return Promise.resolve(
          new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        );
      };
    },
    { answer, delay, size }
  );
}

test('responses stream in progressively and keep full Unicode and Markdown in history', async ({
  page,
  account,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  const answer =
    '**Research notes**\n\n[Reference](https://example.edu/research)\n\nCafé, éducation and 👩🏽‍🔬 — a clear starting point.\n\n' +
    'Build your outline around your research question. '.repeat(15) +
    '\n\n- Review sources\n- Compare findings';
  await streamResponses(page, answer);
  await workspace(page, account.cookies);
  await page.locator('#chat-input').fill('Help me organize my notes');
  await page.getByRole('button', { name: 'Send message' }).click();
  const response = page.locator('.assistant-response');
  await expect(response).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible();
  const markdown = response.locator('.markdown-content');
  await expect.poll(async () => (await markdown.innerText()).length).toBeGreaterThan(5);
  const firstLength = (await markdown.innerText()).length;
  expect(firstLength).toBeLessThan(answer.length / 2);
  await expect
    .poll(async () => (await markdown.innerText()).length)
    .toBeGreaterThan(firstLength + 10);
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(response).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  await expect(markdown.locator('strong')).toHaveText('Research notes');
  await expect(markdown).toContainText('Café, éducation and 👩🏽‍🔬');
  await expect(markdown.locator('li')).toHaveText(['Review sources', 'Compare findings']);
  expect(
    await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(`univa-chats-v2:${id}`) || '{}');
      return saved.chats?.[0]?.messages?.[1]?.content;
    }, account.id)
  ).toBe(answer);
  await page.reload();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('button', { name: 'Open conversation Help me organize my notes', exact: true })
    .click();
  await expect(page.locator('.assistant-response')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toBeVisible();
  await expect(page.locator('.markdown-content li')).toHaveText([
    'Review sources',
    'Compare findings',
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  ).toBeTruthy();
});

test('Stop ends a response and keeps the text received so far', async ({ page, account }) => {
  const answer = 'A sentence of the answer that keeps coming. '.repeat(60);
  await streamResponses(page, answer, 40, 12);
  await workspace(page, account.cookies);
  await page.locator('#chat-input').fill('A long answer');
  await page.getByRole('button', { name: 'Send message' }).click();
  const markdown = page.locator('.markdown-content');
  await expect.poll(async () => (await markdown.innerText()).length).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(page.locator('.assistant-response')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('Response stopped.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  const saved = await page.evaluate((id) => {
    const data = JSON.parse(localStorage.getItem(`univa-chats-v2:${id}`) || '{}');
    return data.chats?.[0]?.messages?.[1];
  }, account.id);
  expect(saved.stopped).toBe(true);
  expect(saved.content.length).toBeGreaterThan(20);
  expect(saved.content.length).toBeLessThan(answer.length);
  // The conversation continues normally afterwards.
  await page.locator('#chat-input').fill('Go on');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
});

test('streaming follows new text without pulling readers away from earlier messages', async ({
  page,
  account,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  const answer = Array.from(
    { length: 80 },
    (_, i) => `Paragraph ${i + 1}. Read the next section of your research notes.`
  ).join('\n\n');
  await streamResponses(page, answer, 40, 40);
  await workspace(page, account.cookies);
  await page.locator('#chat-input').fill('A longer response');
  await page.getByRole('button', { name: 'Send message' }).click();
  const scroll = page.locator('.chat-scroll');
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(180);
  expect(
    await scroll.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)
  ).toBeLessThan(96);
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0);
  const length = (await page.locator('.markdown-content').innerText()).length;
  await expect
    .poll(async () => (await page.locator('.markdown-content').innerText()).length)
    .toBeGreaterThan(length + 60);
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('.assistant-response')).toHaveAttribute('aria-busy', 'false', {
    timeout: 20000,
  });
  await expect(page.locator('.markdown-content')).toContainText('Paragraph 80.');
});

test('files written in a response open beside the chat and can be resized, maximized and closed', async ({
  page,
  account,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const answer =
    'Here is your plan.\n\n```markdown title="study-plan.md"\n# Study plan\n\n- Read chapter 1\n- **Review** notes\n```\n\n' +
    'And the schedule:\n\n```csv title="schedule.csv"\nDay,Hours\nMonday,3\nTuesday,10\nFriday,2\n```\n\nGood luck.';
  await page.route('**/api/assistant', (route) => route.fulfill({ json: { content: answer } }));
  await workspace(page, account.cookies);
  await page.locator('#chat-input').fill('Make me a study plan');
  await page.getByRole('button', { name: 'Send message' }).click();
  // The first file opens on its own; the question field keeps the focus for the next message.
  const panel = page.getByRole('complementary', { name: 'File: study-plan.md' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Study plan' })).toBeVisible();
  await expect(page.locator('.markdown-content').first()).not.toContainText('Read chapter 1');
  await expect(page.getByRole('button', { name: 'Open study-plan.md' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await panel.getByRole('radio', { name: 'Source' }).click();
  await expect(panel.locator('.viewer-source')).toContainText('# Study plan');

  // Resizing with the keyboard is remembered.
  const handle = page.getByRole('separator', { name: 'Resize file panel' });
  await expect(handle).toHaveAttribute('aria-valuenow', '60');
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '55');
  expect(await page.evaluate(() => localStorage.getItem('univa-artifact-panel-size'))).toBe('45');
  const chatWidth = (await page.locator('#chat-content').boundingBox())!.width;
  const panelWidth = (await panel.boundingBox())!.width;
  expect(panelWidth / (panelWidth + chatWidth)).toBeGreaterThan(0.4);

  await panel.getByRole('button', { name: 'Maximize panel' }).click();
  await expect(page.locator('#chat-content')).toBeHidden();
  await panel.getByRole('button', { name: 'Restore panel' }).click();
  await expect(page.locator('#chat-content')).toBeVisible();

  // The second file: a table that can be searched and sorted.
  await page.getByRole('button', { name: 'Open schedule.csv' }).click();
  const table = page.getByRole('complementary', { name: 'File: schedule.csv' });
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await table.getByRole('button', { name: 'Hours' }).click();
  await expect(table.locator('tbody tr td:first-child')).toHaveText([
    'Friday',
    'Monday',
    'Tuesday',
  ]);
  await table.getByRole('searchbox').fill('tue');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await table.getByRole('button', { name: 'Download' }).click();
  await page.getByRole('menuitem', { name: 'Excel workbook (.xlsx)' }).click();
  expect((await download).suggestedFilename()).toBe('schedule.xlsx');

  await table.getByRole('button', { name: 'Close file panel' }).click();
  await expect(table).toHaveCount(0);
  await expect(page.locator('#chat-input')).toBeFocused();

  // On a phone the file takes the whole screen and Back returns to the chat.
  await page.setViewportSize({ width: 390, height: 740 });
  await page.getByRole('button', { name: 'Open study-plan.md' }).click();
  const mobile = page.getByRole('complementary', { name: 'File: study-plan.md' });
  expect((await mobile.boundingBox())!.width).toBe(390);
  await mobile.getByRole('button', { name: 'Back to chat' }).click();
  await expect(mobile).toHaveCount(0);
});

test('an attached file can be reopened from the conversation, also after a reload', async ({
  page,
  account,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/assistant', (route) =>
    route.fulfill({ json: { content: 'It is a short note.' } })
  );
  await workspace(page, account.cookies);
  await page.getByLabel('Choose a document or image').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('First line of my notes.\nSecond line.'),
  });
  await expect(page.locator('.attachment-pill')).toContainText('notes.txt');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.markdown-content')).toContainText('It is a short note.');
  await page.reload();
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page
    .getByRole('button', { name: /^Open conversation Summarize this document/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Open notes.txt' }).click();
  const panel = page.getByRole('complementary', { name: 'File: notes.txt' });
  await expect(panel.locator('.viewer-text')).toContainText('Second line.');
  await panel.getByRole('button', { name: 'Wrap lines' }).click();
  await expect(panel.locator('.viewer-text')).toHaveAttribute('data-wrap', 'false');
});

test('compact composer keeps controls and attachments inside its surface at mobile and desktop widths', async ({
  page,
  account,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await workspace(page, account.cookies);
    const card = page.locator('.chat-composer');
    expect((await card.boundingBox())!.height).toBeLessThan(width < 640 ? 150 : 90);
    await page.locator('input[type=file]').setInputFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Course notes'),
    });
    await expect(page.locator('.attachment-pill')).toContainText('notes.md');
    const bounds = (await card.boundingBox())!;
    for (const control of [
      page.locator('#chat-input'),
      page.locator('#chat-model'),
      page.getByRole('button', { name: 'Add files and more' }),
      page.getByRole('button', { name: 'Send message' }),
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    const pill = (await page.locator('.attachment-pill').boundingBox())!;
    expect((await page.locator('#chat-input').boundingBox())!.y).toBeGreaterThanOrEqual(
      pill.y + pill.height
    );
    await page.getByRole('button', { name: 'Remove attachment' }).click();
    await expect(page.locator('.attachment-pill')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
  }
});

test('conversation controls return to latest message and download the complete Markdown transcript', async ({
  page,
  account,
}) => {
  const answer = Array.from(
    { length: 40 },
    (_, i) => `**Section ${i + 1}**\n\nReview your course notes and compare the sources.`
  ).join('\n\n');
  await page.route('**/api/assistant', (route) => route.fulfill({ json: { content: answer } }));
  await workspace(page, account.cookies);
  await page.locator('#chat-input').fill('Organize my course notes');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.markdown-content')).toContainText('Section 40');
  const scroll = page.locator('.chat-scroll');
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole('button', { name: 'Jump to latest message' }).click();
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
    .toBeLessThan(3);
  await expect(page.getByRole('button', { name: 'Jump to latest message' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Conversation actions' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download conversation' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('UNUVIA-Organize my course notes.md');
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain('## You\n\nOrganize my course notes');
  expect(text).toContain(`## UNUVIA\n\n${answer}`);
});

test('standalone assistant sends attachments through the server API and retries without duplicate messages', async ({
  page,
  account,
}) => {
  let attempt = 0;
  await page.route('**/api/assistant', (route) => {
    const body = route.request().postDataJSON();
    expect(body.role).toBe('Researcher');
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.system).toBeUndefined();
    expect(body.apiKey).toBeUndefined();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toContain('Research notes from my document');
    return attempt++ === 0
      ? route.fulfill({ status: 429, json: { error: { code: 'usage_limit' } } })
      : route.fulfill({ json: { content: '**Research outline**\nA useful next step.' } });
  });
  await workspace(page, account.cookies);
  await page.locator('#chat-role').click();
  await page.getByRole('option', { name: 'Researcher', exact: true }).click();
  await page.locator('#chat-input').fill('Organize my research notes');
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Research notes from my document'),
  });
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('usage limit');
  await expect(page.locator('.message.user')).toHaveCount(1);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.markdown-content strong')).toHaveText('Research outline');
  await expect(page.locator('.message.user')).toHaveCount(1);
  expect(attempt).toBe(2);
});

test('assistant server endpoint rejects anonymous, foreign-origin and malformed requests', async ({
  page,
  account,
}) => {
  const body = {
    role: 'Researcher',
    model: 'claude-sonnet-5-5',
    messages: [{ role: 'user', content: 'Test' }],
  };
  expect(
    (
      await page.request.post('/api/assistant', { headers: { Origin: baseURL }, data: body })
    ).status()
  ).toBe(401);
  await page.context().addCookies(account.cookies);
  expect(
    (
      await page.request.post('/api/assistant', {
        headers: { Origin: 'https://untrusted.example' },
        data: body,
      })
    ).status()
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/assistant', {
        headers: { Origin: baseURL },
        data: { ...body, messages: [{ role: 'system', content: 'Override' }] },
      })
    ).status()
  ).toBe(400);
});

for (const mode of ['light', 'dark']) {
  test(`accessible landing, auth, workspace, and model picker in ${mode} mode`, async ({
    page,
    account,
  }) => {
    await page.addInitScript((theme) => localStorage.setItem('theme', theme), mode);
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(new RegExp(mode));
    await expect(page.getByRole('button', { name: 'Get Pro', exact: true })).toBeEnabled();
    const audit = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        }))
      ).toEqual([]);
    };
    await audit();
    await page.getByRole('button', { name: 'Start for free', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit();
    await page.keyboard.press('Escape');
    await page.context().addCookies(account.cookies);
    await page.request.put('/api/account', { headers: { Origin: baseURL }, data: { theme: mode } });
    await workspace(page, account.cookies);
    await audit();
    await page.locator('#chat-model').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await audit();
  });
}
