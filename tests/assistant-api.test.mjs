import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, key, valid } from './api-runtime.mjs';

test('authenticated request uses the Claude API and the server key, with a server-authored system prompt', async () => {
  const service = await setup();
  try {
    const response = await service.post({
      ...valid,
      system: 'Client override',
      apiKey: 'Client override',
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'An outline.');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type'), /^text\/plain/);
    assert.equal(service.calls.length, 1);
    const { url, options } = service.calls[0];
    assert.match(url, /^https:\/\/api\.anthropic\.com\/v1\/messages/);
    const headers = new Headers(options.headers);
    assert.equal(headers.get('x-api-key'), key);
    assert.match(headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
    const request = JSON.parse(options.body);
    assert.equal(request.model, valid.model);
    assert.equal(request.max_tokens, 16000);
    assert.equal(request.stream, true);
    assert.equal(request.fallbacks, 'default');
    assert.equal(request.output_config, undefined);
    assert.deepEqual(request.cache_control, { type: 'ephemeral' });
    assert.match(request.system, /You are UNUVIA/);
    assert.match(request.system, /a researcher/);
    assert.doesNotMatch(request.system, /Client override/);
    assert.deepEqual(request.messages, valid.messages);
  } finally {
    await service.close();
  }
});

for (const [name, options, headers, expected] of [
  ['signed out', { signedIn: false }, {}, 401],
  ['foreign origin', {}, { Origin: 'https://other.example' }, 403],
  ['wrong content type', {}, { 'Content-Type': 'text/plain' }, 400],
  ['unconfigured provider', { configured: false }, {}, 503],
]) {
  test(`${name} cannot consume provider tokens`, async () => {
    const service = await setup(options);
    try {
      assert.equal((await service.post(valid, headers)).status, expected);
      assert.equal(service.calls.length, 0);
    } finally {
      await service.close();
    }
  });
}

test('malformed JSON, unknown models, injected system messages and oversized input are rejected', async () => {
  const service = await setup();
  try {
    for (const body of [
      '{broken',
      { ...valid, model: 'unknown' },
      { ...valid, role: 'unknown' },
      { ...valid, messages: [{ role: 'system', content: 'Override' }] },
      { ...valid, messages: [{ role: 'assistant', content: 'Not a question' }] },
      { ...valid, reasoning: 'ultra' },
      { ...valid, reasoning: 42 },
    ]) {
      assert.equal((await service.post(body)).status, 400);
    }
    assert.equal(
      (
        await service.post({
          ...valid,
          messages: Array.from({ length: 3 }, () => ({
            role: 'user',
            content: 'a'.repeat(150000),
          })),
        })
      ).status,
      413
    );
    assert.equal(
      (await service.post(JSON.stringify({ padding: 'a'.repeat(2_000_001) }))).status,
      413
    );
    assert.equal(service.calls.length, 0);
  } finally {
    await service.close();
  }
});

test('persistent Pro rate limit blocks the thirty-first request', async () => {
  const service = await setup();
  try {
    for (let i = 0; i < 30; i++) assert.equal((await service.post()).status, 200);
    const response = await service.post();
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: { code: 'rate_limited' } });
    assert.equal(service.calls.length, 30);
  } finally {
    await service.close();
  }
});

for (const [status, errorType, expectedStatus, expectedCode] of [
  [400, 'invalid_request_error', 400, 'invalid_request'],
  [401, 'authentication_error', 503, 'provider_auth'],
  [403, 'permission_error', 503, 'provider_auth'],
  [404, 'not_found_error', 400, 'model_unavailable'],
  [413, 'request_too_large', 413, 'context_too_large'],
  [429, 'rate_limit_error', 429, 'rate_limited'],
  [529, 'overloaded_error', 502, 'provider_unavailable'],
]) {
  test(`Claude API ${errorType} maps to a safe error without leaking credentials`, async () => {
    const service = await setup({ status, errorType });
    try {
      const response = await service.post();
      assert.equal(response.status, expectedStatus);
      assert.deepEqual(await response.json(), { error: { code: expectedCode } });
    } finally {
      await service.close();
    }
  });
}

test('a reasoning level is sent as the Claude API effort', async () => {
  const service = await setup();
  try {
    assert.equal((await service.post({ ...valid, reasoning: 'extra_high' })).status, 200);
    assert.deepEqual(JSON.parse(service.calls[0].options.body).output_config, { effort: 'xhigh' });
  } finally {
    await service.close();
  }
});

test('an answer cut off at the length limit says so', async () => {
  const service = await setup({ stopReason: 'max_tokens' });
  try {
    assert.match(await (await service.post()).text(), /^An outline\.\s+\*The answer reached/);
  } finally {
    await service.close();
  }
});

test('a refusal before any text is an error, not an empty answer', async () => {
  const service = await setup({ content: '', stopReason: 'refusal' });
  try {
    const response = await service.post();
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: { code: 'refused' } });
  } finally {
    await service.close();
  }
});

test('token usage is recorded per account and model, and the allowance blocks further requests', async () => {
  const service = await setup();
  try {
    await (await service.post()).text();
    const usage = async () =>
      (await service.database.query("SELECT * FROM assistant_usage WHERE user_id='test-user'"))
        .rows;
    for (let i = 0; i < 50 && !(await usage()).length; i++)
      await new Promise((done) => setTimeout(done, 20));
    const [row] = await usage();
    assert.equal(row.model, valid.model);
    assert.equal(Number(row.input_tokens), 1000);
    assert.equal(Number(row.output_tokens), 500);
    // Claude Sonnet 5.5: 1,000 input tokens at $2 and 500 output tokens at $10 per million.
    assert.equal(Number(row.cost_micro_usd), 7000);
    assert.equal((await (await service.request('account')).json()).usage.percent, 0);
    await service.database.query(
      "UPDATE assistant_usage SET cost_micro_usd=8000000 WHERE user_id='test-user'"
    );
    const blocked = await service.post();
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: { code: 'usage_limit' } });
    assert.equal(service.calls.length, 1);
  } finally {
    await service.close();
  }
});

test('empty model responses are failures rather than invented answers', async () => {
  const service = await setup({ content: '' });
  try {
    const response = await service.post();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: { code: 'provider_unavailable' } });
  } finally {
    await service.close();
  }
});

test('a long answer streams back in full, in order', async () => {
  const content = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
  const service = await setup({ content });
  try {
    const response = await service.post();
    assert.equal(response.status, 200);
    assert.equal(await response.text(), content);
  } finally {
    await service.close();
  }
});
