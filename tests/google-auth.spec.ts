import { test, expect } from '@playwright/test';
const port = process.env.UNIVA_TEST_PORT || '4217';
const origin = `http://127.0.0.1:${port}`;

for (const host of ['127.0.0.1', 'localhost']) {
  test(`real Google OAuth starts with an old session cookie from ${host}`, async ({ page }) => {
    const entry = `http://${host}:${port}`;
    await page.context().addCookies([
      { name: 'better-auth.session_token', value: 'previous-database-session', url: entry },
      { name: 'better-auth.session_token', value: 'previous-database-session', url: origin },
    ]);
    // Exercise the real Better Auth endpoint and PostgreSQL OAuth state persistence.
    // Stop at Google; do not sign in or send a request to an external Google account.
    let redirectUri: string | null = null;
    await page.route('https://accounts.google.com/**', async (route) => {
      redirectUri = new URL(route.request().url()).searchParams.get('redirect_uri');
      await route.fulfill({
        contentType: 'text/html',
        body: '<h1>Google sign-in destination reached</h1>',
      });
    });
    await page.goto(entry + '/assistant?role=2&prompt=Keep%20my%20notes');
    await expect(page).toHaveURL(origin + '/assistant?role=2&prompt=Keep%20my%20notes');
    const google = page.getByRole('button', { name: 'Continue with Google', exact: true });
    await expect(google).toBeEnabled();
    const response = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/sign-in/social')
    );
    await google.click();
    expect((await response).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Google sign-in destination reached' })
    ).toBeVisible();
    expect(redirectUri).toBe(origin + '/api/auth/callback/google');
  });
}

test('wrong local port navigates to the configured origin and preserves the account tab', async ({
  request,
}) => {
  const response = await request.get(origin + '/account?tab=subscription', {
    headers: { Host: `127.0.0.1:${Number(port) + 1}` },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe(origin + '/account?tab=subscription');
  expect(response.headers()['cache-control']).toBe('no-store');
});

test('Google OAuth still rejects a foreign origin when a session cookie exists', async ({
  playwright,
}) => {
  const request = await playwright.request.newContext({ baseURL: origin });
  const response = await request.post('/api/auth/sign-in/social', {
    headers: {
      Origin: 'https://foreign.example',
      Cookie: 'better-auth.session_token=previous-database-session',
    },
    data: { provider: 'google', callbackURL: '/assistant', disableRedirect: true },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe('INVALID_ORIGIN');
  await request.dispose();
});
