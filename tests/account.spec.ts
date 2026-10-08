import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Pool } from 'pg';
const baseURL = `http://127.0.0.1:${process.env.UNIVA_TEST_PORT || '4217'}`;
const password = 'AccountTest123!';
async function register(
  request: APIRequestContext,
  name = 'Account Tester',
  email = `account-${crypto.randomUUID()}@example.test`
) {
  const response = await request.post('/api/auth/sign-up/email', {
    headers: {
      Origin: baseURL,
      'x-forwarded-for': `192.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
    },
    data: { name, email, password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { ...(await response.json()).user, cookies: (await request.storageState()).cookies };
}
async function isolatedDB() {
  if (
    !process.env.UNIVA_TEST_SERVER_MANAGED ||
    !new URL(process.env.DATABASE_URL!).searchParams.get('options')?.includes('search_path=e2e_')
  )
    throw new Error('Use npm run test:e2e for isolated database fixtures.');
  return new Pool({ connectionString: process.env.DATABASE_URL });
}
async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))
  ).toEqual([]);
}

for (const width of [320, 1440]) {
  test(`profile and defaults persist across sessions with accessible settings at ${width}px`, async ({
    page,
    playwright,
  }) => {
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL },
    });
    const account = await register(request);
    await page.context().addCookies(account.cookies);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/account');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Change photo', exact: true }).click();
    await (await chooser).setFiles('tests/fixtures/t.png');
    await expect(page.getByAltText('Your profile')).toBeVisible();
    await page.getByLabel('Full name').fill('Aina Research');
    await page.getByLabel('University or institution').fill('University of Antananarivo');
    await page.getByLabel('Your role', { exact: true }).click();
    await page.getByRole('option', { name: 'Researcher', exact: true }).click();
    await page.getByLabel('Country', { exact: true }).selectOption('MG');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Profile saved.');
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Appearance').selectOption('dark');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Preferences saved.');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await audit(page);
    await request.post('/api/auth/sign-out', { data: {} });
    await page.context().clearCookies();
    const signedIn = await request.post('/api/auth/sign-in/email', {
      data: { email: account.email, password },
    });
    expect(signedIn.ok()).toBeTruthy();
    await page.context().addCookies((await request.storageState()).cookies);
    await page.goto('/account');
    await expect(page.getByLabel('Full name')).toHaveValue('Aina Research');
    await expect(page.getByAltText('Your profile')).toHaveAttribute(
      'src',
      /^data:image\/jpeg;base64,/
    );
    await expect(page.getByLabel('University or institution')).toHaveValue(
      'University of Antananarivo'
    );
    await expect(page.getByLabel('Country', { exact: true })).toHaveValue('MG');
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    await expect(page.getByText(/^55,000 Ar/)).toBeVisible();
    await audit(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    await page.goto('/assistant');
    await expect(page.locator('[data-ready=true]')).toBeVisible();
    await expect(page.locator('#chat-role')).toContainText('Researcher');
    await expect(page.locator('#chat-model')).toContainText('Claude Sonnet 4.6 Free');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.locator('#chat-model').click();
    await expect(page.getByRole('menuitemradio', { name: /^Claude Opus 5\.5/ })).toBeDisabled();
    await request.dispose();
  });
}

test('manual subscription request, administrator approval and Pro model access work end to end', async ({
  page,
  playwright,
  browser,
}) => {
  const userRequest = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const account = await register(userRequest, 'Payment Tester');
  await page.context().addCookies(account.cookies);
  await page.goto('/account?tab=subscription');
  await page.getByLabel('Payment method').selectOption('mobile_money');
  await page.getByLabel('2. Enter your transaction reference').fill('E2E-' + crypto.randomUUID());
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Request received');
  await expect(page.getByText('pending', { exact: true })).toBeVisible();
  expect((await (await userRequest.get('/api/account')).json()).plan).toBe('free');
  expect((await userRequest.get('/api/admin/subscriptions')).status()).toBe(404);
  const adminRequest = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const admin = await register(
    adminRequest,
    'Subscription Admin',
    'subscription-admin@example.test'
  );
  expect((await adminRequest.get('/api/admin/subscriptions')).status()).toBe(404);
  const db = await isolatedDB();
  await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [admin.id]);
  await db.end();
  const adminContext = await browser.newContext();
  await adminContext.addCookies(admin.cookies);
  const adminPage = await adminContext.newPage();
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.goto(baseURL + '/admin/subscriptions');
  const card = adminPage.locator('[data-slot=card]').filter({ hasText: account.email });
  await card.getByRole('button', { name: 'Approve payment', exact: true }).click();
  await expect(adminPage.getByRole('button', { name: 'Go back', exact: true })).toBeFocused();
  await adminPage.getByLabel('Review note (optional)').fill('Received and verified.');
  await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(adminPage.getByRole('status')).toContainText('updated');
  await expect(card.getByText('approved', { exact: true })).toBeVisible();
  await audit(adminPage);
  await adminPage.getByRole('button', { name: 'Toggle light or dark mode' }).click();
  await expect(adminPage.locator('html')).toHaveClass(/dark/);
  await audit(adminPage);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your plan' })).toContainText('Pro');
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  await page.goto('/assistant');
  await expect(page.locator('[data-ready=true]')).toBeVisible();
  await page.locator('#chat-model').click();
  await page.getByRole('menuitemradio', { name: /^Claude Opus 5\.5/ }).click();
  await expect(page.locator('#chat-model')).toContainText('Claude Opus 5.5');
  await adminContext.close();
  await adminRequest.dispose();
  await userRequest.dispose();
});

test('password change and guarded account deletion use Better Auth and clear server records', async ({
  page,
  playwright,
}) => {
  const request = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const account = await register(request, 'Delete Tester');
  await page.context().addCookies(account.cookies);
  await page.goto('/account?tab=preferences');
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill('NewPassword123!');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Password changed');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Keep account' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await dialog.getByLabel('Current password').fill('NewPassword123!');
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page).toHaveURL(baseURL + '/');
  const db = await isolatedDB();
  expect((await db.query('SELECT id FROM "user" WHERE id=$1', [account.id])).rowCount).toBe(0);
  expect(
    (await db.query('SELECT user_id FROM profile WHERE user_id=$1', [account.id])).rowCount
  ).toBe(0);
  await db.end();
  await request.dispose();
});
