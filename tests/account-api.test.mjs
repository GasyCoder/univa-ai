import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, valid } from './api-runtime.mjs';
const freeRequest = { ...valid, model: 'claude-sonnet-4-6-free' };
async function withService(options, work) {
  const s = await setup(options);
  try {
    await work(s);
  } finally {
    await s.close();
  }
}

test('profile defaults and persistence are scoped to the session; account IDs and plans in the body have no effect', async () =>
  withService({ plan: 'free' }, async (s) => {
    const initial = await (await s.request('account')).json();
    assert.equal(initial.plan, 'free');
    assert.equal(initial.profile.role, 'Faculty');
    const saved = await s.request('account', 'PUT', {
      user_id: 'other-user',
      plan: 'pro',
      name: 'Aina',
      role: 'Researcher',
      institution: 'UNUVIA University',
      country: 'MG',
      theme: 'dark',
      default_model: 'claude-sonnet-4-6-free',
      default_reasoning: null,
      image: 'data:image/png;base64,aGVsbG8=',
    });
    assert.equal(saved.status, 200);
    const data = await (await s.request('account')).json();
    assert.equal(data.user.name, 'Aina');
    assert.equal(data.profile.theme, 'dark');
    assert.equal(data.price.formatted, '55,000 Ar');
    assert.equal(data.plan, 'free');
    const other = await (
      await s.request('account', 'GET', undefined, { 'x-test-user': 'other-user' })
    ).json();
    assert.equal(other.user.name, 'Other User');
    assert.equal(other.profile.country, '');
    assert.equal(other.price.currency, 'USD');
  }));
test('invalid settings, unsupported reasoning and paid models on Free are rejected without changing the profile', async () =>
  withService({ plan: 'free' }, async (s) => {
    for (const body of [
      { name: '' },
      { name: 'x'.repeat(101) },
      { role: 'root' },
      { country: 'ZZ' },
      { theme: 'neon' },
      { institution: 'x'.repeat(121) },
      { default_model: 'claude-sonnet-5-5' },
      { default_reasoning: 'high' },
      { image: 'javascript:alert(1)' },
      { image: 'data:image/svg+xml;base64,AAAA' },
    ])
      assert.equal((await s.request('account', 'PUT', body)).status, 422);
    assert.equal(
      (
        await s.request(
          'account',
          'PUT',
          { name: 'Changed' },
          { Origin: 'https://foreign.example' }
        )
      ).status,
      403
    );
    assert.equal((await (await s.request('account')).json()).user.name, 'First User');
  }));
test('signed-out accounts and unavailable databases receive safe errors', async () => {
  await withService({ signedIn: false }, async (s) => {
    assert.equal((await s.request('account')).status, 401);
    assert.equal(
      (await s.request('subscription', 'POST', { method: 'card', reference: 'abc' })).status,
      401
    );
  });
  await withService({ brokenDatabase: true }, async (s) => {
    const response = await s.request('account');
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(await response.json()).includes('credentials'), false);
    assert.equal((await s.post()).status, 503);
  });
});
test('payment requests use server prices; concurrency permits only one pending request; other accounts cannot read it', async () =>
  withService({ plan: 'free' }, async (s) => {
    await s.request('account', 'PUT', { country: 'FR' });
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        s.request('subscription', 'POST', {
          method: 'mobile_money',
          reference: 'TX-' + i,
          amount: 1,
          currency: 'XXX',
          user_id: 'other-user',
        })
      )
    );
    assert.equal(responses.filter((r) => r.status === 201).length, 1);
    assert.equal(responses.filter((r) => r.status === 422).length, 7);
    const history = await (await s.request('subscription')).json();
    assert.equal(history.requests.length, 1);
    assert.equal(history.requests[0].amount, 1200);
    assert.equal(history.requests[0].currency, 'EUR');
    assert.equal(
      (
        await (
          await s.request('subscription', 'GET', undefined, { 'x-test-user': 'other-user' })
        ).json()
      ).requests.length,
      0
    );
  }));
test('payment reference validation and unconfigured payment methods block requests', async () => {
  await withService({ paymentConfigured: false }, async (s) =>
    assert.equal(
      (await s.request('subscription', 'POST', { method: 'mobile_money', reference: 'TX-123' }))
        .status,
      422
    )
  );
  await withService({}, async (s) => {
    for (const body of [
      { method: 'unknown', reference: 'TX-123' },
      { method: 'card', reference: '' },
      { method: 'card', reference: 'a'.repeat(121) },
    ])
      assert.equal((await s.request('subscription', 'POST', body)).status, 422);
  });
});
test('only a verified allowlisted administrator can review payments', async () =>
  withService({}, async (s) => {
    for (const id of ['test-user', 'other-user', 'unverified-admin']) {
      assert.equal(
        (await s.request('admin/subscriptions', 'GET', undefined, { 'x-test-user': id })).status,
        404
      );
      assert.equal(
        (
          await s.request(
            'admin/subscriptions',
            'POST',
            { id: 'x', action: 'approve', note: '' },
            { 'x-test-user': id }
          )
        ).status,
        404
      );
    }
    assert.equal(
      (await s.request('admin/subscriptions', 'GET', undefined, { 'x-test-user': 'admin' })).status,
      200
    );
  }));
test('approval grants exactly one period, repeated concurrent approvals cannot extend it twice; renewal and cancellation work', async () =>
  withService({ plan: 'free' }, async (s) => {
    const admin = { 'x-test-user': 'admin' };
    const payment = await (
      await s.request('subscription', 'POST', { method: 'card', reference: 'FIRST-123' })
    ).json();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        s.request(
          'admin/subscriptions',
          'POST',
          { id: payment.id, action: 'approve', note: 'Verified' },
          admin
        )
      )
    );
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 4);
    let account = await (await s.request('account')).json();
    assert.equal(account.plan, 'pro');
    const firstEnd = new Date(account.subscription.current_period_end);
    assert.ok(firstEnd - Date.now() > 29.99 * 86400000 && firstEnd - Date.now() < 30.01 * 86400000);
    assert.equal((await s.post()).status, 200);
    const renewal = await (
      await s.request('subscription', 'POST', { method: 'card', reference: 'NEXT-123' })
    ).json();
    assert.equal(
      (
        await s.request(
          'admin/subscriptions',
          'POST',
          { id: renewal.id, action: 'approve', note: '' },
          admin
        )
      ).status,
      200
    );
    account = await (await s.request('account')).json();
    assert.equal(new Date(account.subscription.current_period_end) - firstEnd, 30 * 86400000);
    assert.equal(
      (
        await s.request(
          'admin/subscriptions',
          'POST',
          { id: 'test-user', action: 'cancel', note: 'User request' },
          admin
        )
      ).status,
      200
    );
    assert.equal((await (await s.request('account')).json()).plan, 'free');
    assert.equal((await s.post()).status, 403);
    assert.equal(
      (
        await s.request(
          'admin/subscriptions',
          'POST',
          { id: 'test-user', action: 'extend', note: 'Courtesy period' },
          admin
        )
      ).status,
      200
    );
    assert.equal((await (await s.request('account')).json()).plan, 'pro');
    const audit = await (await s.request('admin/subscriptions', 'GET', undefined, admin)).json();
    assert.equal(audit.events.length, 4);
  }));
test('rejection needs a note, preserves Free and prevents reference reuse', async () =>
  withService({ plan: 'free' }, async (s) => {
    const admin = { 'x-test-user': 'admin' };
    const payment = await (
      await s.request('subscription', 'POST', { method: 'card', reference: 'MISSING-123' })
    ).json();
    assert.equal(
      (
        await s.request(
          'admin/subscriptions',
          'POST',
          { id: payment.id, action: 'reject', note: '' },
          admin
        )
      ).status,
      422
    );
    assert.equal(
      (
        await s.request(
          'admin/subscriptions',
          'POST',
          { id: payment.id, action: 'reject', note: 'Payment not received' },
          admin
        )
      ).status,
      200
    );
    const history = await (await s.request('subscription')).json();
    assert.equal(history.requests[0].status, 'rejected');
    assert.equal(history.requests[0].note, 'Payment not received');
    assert.equal((await (await s.request('account')).json()).plan, 'free');
    assert.equal(
      (await s.request('subscription', 'POST', { method: 'card', reference: 'missing-123' }))
        .status,
      422
    );
    assert.equal(
      (await s.request('subscription', 'POST', { method: 'card', reference: 'NEW-123' })).status,
      201
    );
  }));
test('expired or cancelled Pro cannot bypass the Free model or rate limits', async () =>
  withService({}, async (s) => {
    await s.database.query(
      "UPDATE subscription SET current_period_end=NOW()-INTERVAL '1 second' WHERE user_id='test-user'"
    );
    assert.equal((await (await s.request('account')).json()).subscription.status, 'expired');
    assert.equal((await s.post()).status, 403);
    assert.equal(s.calls.length, 0);
    const results = await Promise.all(Array.from({ length: 12 }, () => s.post(freeRequest)));
    assert.equal(results.filter((r) => r.status === 200).length, 10);
    assert.equal(results.filter((r) => r.status === 429).length, 2);
    await s.database.query(
      "UPDATE subscription SET status='cancelled',current_period_end=NOW()+INTERVAL '30 days' WHERE user_id='test-user'"
    );
    assert.equal((await s.post()).status, 403);
  }));
test('deleting an account cascades profile, subscription, payment and request counters', async () =>
  withService({}, async (s) => {
    await s.request('account');
    await s.request('subscription', 'POST', { method: 'card', reference: 'DELETE-123' });
    await s.post();
    await s.database.query('DELETE FROM "user" WHERE id=$1', ['test-user']);
    for (const table of ['profile', 'subscription', 'payment_request', 'assistant_rate_limits'])
      assert.equal(
        (await s.database.query(`SELECT * FROM ${table} WHERE user_id=$1`, ['test-user'])).rowCount,
        0
      );
  }));
