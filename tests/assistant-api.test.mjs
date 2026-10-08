import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import ts from 'typescript';
import Database from 'better-sqlite3';

const origin = 'http://127.0.0.1:4200';
const key = 'apx_test_server_only';
const valid = {
  model: 'claude-sonnet-5-5',
  role: 'Researcher',
  messages: [{ role: 'user', content: 'Outline these research notes.' }],
};

// Run the actual TypeScript route and provider with isolated auth and mocked APMIX HTTP.
// No external request, real key, or user database is used by these tests.
async function setup({
  signedIn = true,
  configured = true,
  status = 200,
  providerCode,
  content = 'An outline.',
} = {}) {
  const calls = [];
  const database = new Database(':memory:');
  database.exec("CREATE TABLE user (id TEXT PRIMARY KEY); INSERT INTO user VALUES ('test-user')");
  const context = createContext({
    Request,
    Response,
    ReadableStream,
    TextDecoder,
    TextEncoder,
    setTimeout,
    clearTimeout,
    AbortSignal,
    AbortController,
    URL,
    process: { env: { BETTER_AUTH_URL: origin, APMIX_API_KEY: configured ? key : '' } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (status !== 200)
        return Response.json(
          { error: { code: providerCode, message: `Private provider details ${key}` } },
          { status }
        );
      // Server-sent events, one delta per word, as APMIX streams them.
      const events = content
        .split(/(?<= )/)
        .map((delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
      return new Response(events.join('') + 'data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    },
  });
  const cache = new Map();
  const auth = new SyntheticModule(
    ['getAuth', 'getAuthDatabase'],
    function () {
      this.setExport('getAuth', async () => ({
        api: { getSession: async () => (signedIn ? { user: { id: 'test-user' } } : null) },
      }));
      this.setExport('getAuthDatabase', async () => database);
    },
    { context }
  );
  const serverOnly = new SyntheticModule([], () => {}, { context });
  async function load(path) {
    if (cache.has(path)) return cache.get(path);
    const code = ts.transpileModule(await readFile(path, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const module = new SourceTextModule(code, { context, identifier: path });
    cache.set(path, module);
    await module.link(async (specifier) => {
      if (specifier === '@/lib/auth') return auth;
      if (specifier === 'server-only') return serverOnly;
      const dependency = specifier.startsWith('@/')
        ? resolve('src', specifier.slice(2))
        : resolve(dirname(path), specifier);
      return load(dependency + '.ts');
    });
    return module;
  }
  const route = await load(resolve('src/app/api/assistant/route.ts'));
  await route.evaluate();
  return {
    calls,
    close: () => database.close(),
    post: (body = valid, headers = {}) =>
      route.namespace.POST(
        new Request(origin + '/api/assistant', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
          body: typeof body === 'string' ? body : JSON.stringify(body),
        })
      ),
  };
}

test('authenticated request uses the fixed APMIX endpoint and server key, with a server-authored system prompt', async () => {
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
    assert.equal(url, 'https://api.apmix.ai/v1/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.redirect, 'error');
    const request = JSON.parse(options.body);
    assert.equal(request.model, valid.model);
    assert.equal(request.max_tokens, 2048);
    assert.equal(request.stream, true);
    assert.equal(request.reasoning_effort, undefined);
    assert.match(request.messages[0].content, /You are UNUVIA/);
    assert.match(request.messages[0].content, /a researcher/);
    assert.doesNotMatch(request.messages[0].content, /Client override/);
    assert.deepEqual(request.messages.slice(1), valid.messages);
  } finally {
    service.close();
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
      service.close();
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
      // No model is verified to reason yet, so every level is refused.
      { ...valid, reasoning: 'high' },
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
    service.close();
  }
});

test('persistent per-user rate limit blocks the eleventh request', async () => {
  const service = await setup();
  try {
    for (let i = 0; i < 10; i++) assert.equal((await service.post()).status, 200);
    const response = await service.post();
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: { code: 'rate_limited' } });
    assert.equal(service.calls.length, 10);
  } finally {
    service.close();
  }
});

for (const [status, providerCode, expectedStatus, expectedCode] of [
  [401, 'invalid_api_key', 503, 'provider_auth'],
  [403, 'model_not_in_plan', 400, 'model_unavailable'],
  [404, 'model_not_found', 400, 'model_unavailable'],
  [429, 'allowance_exhausted', 429, 'quota_exhausted'],
  [429, 'rate_limit_exceeded', 429, 'rate_limited'],
  [502, 'upstream_error', 502, 'provider_unavailable'],
]) {
  test(`provider ${providerCode} maps to a safe error without leaking credentials`, async () => {
    const service = await setup({ status, providerCode });
    try {
      const response = await service.post();
      assert.equal(response.status, expectedStatus);
      assert.deepEqual(await response.json(), { error: { code: expectedCode } });
    } finally {
      service.close();
    }
  });
}

test('empty model responses are failures rather than invented answers', async () => {
  const service = await setup({ content: '' });
  try {
    const response = await service.post();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: { code: 'provider_unavailable' } });
  } finally {
    service.close();
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
    service.close();
  }
});
