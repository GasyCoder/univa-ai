import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import nextEnv from '@next/env';
import { Pool } from 'pg';
import ts from 'typescript';

nextEnv.loadEnvConfig(process.cwd(), true);
export const origin = 'http://127.0.0.1:4200';
export const key = 'apx_test_server_only';
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
  providerCode,
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
        APMIX_API_KEY: configured ? key : '',
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
    fetch: async (url, options) => {
      if (url.endsWith('/models'))
        return Response.json({
          data: [
            { id: 'claude-sonnet-4-6-free' },
            { id: 'claude-sonnet-5-5' },
            { id: 'claude-opus-5-5' },
          ],
        });
      calls.push({ url, options });
      if (status !== 200)
        return Response.json(
          { error: { code: providerCode, message: `Private provider details ${key}` } },
          { status }
        );
      const events = content
        .split(/(?<= )/)
        .map(
          (delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`
        );
      return new Response(events.join('') + 'data: [DONE]\n\n', {
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
