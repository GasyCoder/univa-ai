import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import nextEnv from '@next/env';
import { Pool } from 'pg';
import ts from 'typescript';
import * as anthropicSdk from '@anthropic-ai/sdk';

nextEnv.loadEnvConfig(process.cwd(), true);
export const origin = 'http://127.0.0.1:4200';
export const key = 'sk-ant-test-server-only';
export const valid = {
  model: 'claude-sonnet-5-5',
  role: 'Researcher',
  messages: [{ role: 'user', content: 'Outline these research notes.' }],
};
// Actual route, subscription logic, SQL and provider decoder; isolated PostgreSQL schema.
// Authentication identity and upstream HTTP are mocked. No real provider credits are used.
export async function setup({
  signedIn = true,
  configured = true,
  status = 200,
  errorType = 'api_error',
  stopReason = 'end_turn',
  content = 'An outline.',
  plan = 'pro',
  brokenDatabase = false,
  paymentConfigured = true,
} = {}) {
  if (!process.env.DATABASE_URL)
    throw new Error('Set DATABASE_URL to a local PostgreSQL database before running API tests.');
  const namespace = 'test_' + randomUUID().replaceAll('-', '');
  const control = new Pool({ connectionString: process.env.DATABASE_URL });
  await control.query(`CREATE SCHEMA ${namespace}`);
  const database = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${namespace}`,
    max: 8,
  });
  await database.query(
    `CREATE TABLE "user" (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,"emailVerified" BOOLEAN NOT NULL,image TEXT,"updatedAt" TIMESTAMPTZ DEFAULT NOW()); CREATE TABLE account ("userId" TEXT,"providerId" TEXT); INSERT INTO "user" (id,name,email,"emailVerified") VALUES ('test-user','First User','first@example.test',false),('other-user','Other User','other@example.test',false),('admin','Administrator','admin@example.test',true),('unverified-admin','Pretender','admin@example.test',false); INSERT INTO account VALUES ('test-user','credential');`
  );
  const schemaSource = await readFile('src/lib/schema.ts', 'utf8');
  await database.query(
    schemaSource.slice(schemaSource.indexOf('`') + 1, schemaSource.lastIndexOf('`'))
  );
  if (plan === 'pro')
    await database.query(
      "INSERT INTO subscription (user_id,plan,status,current_period_end) VALUES ('test-user','pro','active',NOW()+INTERVAL '30 days')"
    );
  const calls = [];
  const responses = [];
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
    process: {
      env: {
        BETTER_AUTH_URL: origin,
        ANTHROPIC_API_KEY: configured ? key : '',
        ADMIN_EMAILS: 'admin@example.test',
        PRO_PRICE_MGA: '55000',
        PAYMENT_MOBILE_MONEY_INSTRUCTIONS: paymentConfigured
          ? 'TEST ONLY: pay externally to the configured merchant.'
          : '',
        PAYMENT_CARD_INSTRUCTIONS: paymentConfigured
          ? 'TEST ONLY: use the external merchant payment link.'
          : '',
      },
    },
    fetch: async (input, options) => {
      const url = String(input);
      if (url.includes('/v1/models'))
        return Response.json({
          data: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'].map((id) => ({
            id,
            type: 'model',
          })),
          has_more: false,
          first_id: null,
          last_id: null,
        });
      calls.push({ url, options });
      if (status !== 200)
        return Response.json(
          { type: 'error', error: { type: errorType, message: `Private provider details ${key}` } },
          { status }
        );
      const event = (data) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`;
      const deltas = content ? content.split(/(?<= )/) : [];
      const events = [
        event({
          type: 'message_start',
          message: {
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: JSON.parse(options.body).model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1000, output_tokens: 1 },
          },
        }),
        ...(deltas.length
          ? [
              event({
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              }),
              ...deltas.map((text) =>
                event({
                  type: 'content_block_delta',
                  index: 0,
                  delta: { type: 'text_delta', text },
                })
              ),
              event({ type: 'content_block_stop', index: 0 }),
            ]
          : []),
        event({
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: 500 },
        }),
        event({ type: 'message_stop' }),
      ];
      return new Response(events.join(''), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    },
  });
  const auth = new SyntheticModule(
    ['getAuth', 'getAuthDatabase'],
    function () {
      this.setExport('getAuth', async () => {
        if (brokenDatabase) throw new Error('private database credentials');
        return {
          api: {
            getSession: async ({ headers }) =>
              signedIn
                ? {
                    user: (
                      await database.query('SELECT * FROM "user" WHERE id=$1', [
                        headers.get('x-test-user') || 'test-user',
                      ])
                    ).rows[0],
                  }
                : null,
          },
        };
      });
      this.setExport('getAuthDatabase', async () => {
        if (brokenDatabase) throw new Error('private database credentials');
        return database;
      });
    },
    { context }
  );
  const db = new SyntheticModule(
    ['transaction'],
    function () {
      this.setExport('transaction', async (work) => {
        const client = await database.connect();
        try {
          await client.query('BEGIN');
          const result = await work(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });
    },
    { context }
  );
  const crypto = new SyntheticModule(
    ['randomUUID'],
    function () {
      this.setExport('randomUUID', randomUUID);
    },
    { context }
  );
  const serverOnly = new SyntheticModule([], () => {}, { context });
  // The real SDK, sending its requests through the mocked fetch above.
  const sdk = new SyntheticModule(
    ['default'],
    function () {
      this.setExport('default', anthropicSdk.default);
    },
    { context }
  );
  const cache = new Map();
  async function load(path) {
    if (cache.has(path)) return cache.get(path);
    const code = ts.transpileModule(await readFile(path, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const module = new SourceTextModule(code, { context, identifier: path });
    cache.set(path, module);
    return module;
  }
  const routes = {};
  // Each entry is loaded once, sequentially, in the same runtime.
  try {
    for (const name of ['assistant', 'account', 'subscription', 'admin/subscriptions', 'pricing']) {
      const route = await load(resolve('src/app/api', name, 'route.ts'));
      await route.link(async (specifier, parent) => {
        if (specifier === 'server-only') return serverOnly;
        if (specifier === 'node:crypto') return crypto;
        if (specifier === '@anthropic-ai/sdk') return sdk;
        const dependency = specifier.startsWith('@/')
          ? resolve('src', specifier.slice(2))
          : resolve(dirname(parent.identifier), specifier);
        if (dependency === resolve('src/lib/auth')) return auth;
        if (dependency === resolve('src/lib/db')) return db;
        return load(dependency + '.ts');
      });
      await route.evaluate();
      routes[name] = route.namespace;
    }
  } catch (error) {
    await database.end();
    await control.query(`DROP SCHEMA ${namespace} CASCADE`);
    await control.end();
    throw error;
  }
  return {
    calls,
    database,
    async close() {
      for (const response of responses)
        if (response.body && !response.bodyUsed) await response.body.cancel();
      await database.end();
      await control.query(`DROP SCHEMA ${namespace} CASCADE`);
      await control.end();
    },
    async request(name, method = 'GET', body, headers = {}) {
      const response = await routes[name][method](
        new Request(origin + '/api/' + name, {
          method,
          headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
          ...(body !== undefined
            ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
            : {}),
        })
      );
      responses.push(response);
      return response;
    },
    post(body = valid, headers = {}) {
      return this.request('assistant', 'POST', body, headers);
    },
  };
}
