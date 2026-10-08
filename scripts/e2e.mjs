import nextEnv from '@next/env';
import { Pool } from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a local PostgreSQL database.');
const control = new Pool({ connectionString: process.env.DATABASE_URL });
const namespace = 'e2e_' + randomUUID().replaceAll('-', '');
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('options', `-c search_path=${namespace}`);
const port = process.env.UNIVA_TEST_PORT || '4217';
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: url.href,
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  APMIX_API_KEY: '',
  ADMIN_EMAILS: 'subscription-admin@example.test',
  PAYMENT_MOBILE_MONEY_INSTRUCTIONS: 'TEST ONLY: Mobile Money merchant instructions.',
  PAYMENT_CARD_INSTRUCTIONS: 'TEST ONLY: external card payment instructions.',
  PRO_PRICE_MGA: '55000',
  UNIVA_TEST_PORT: port,
  UNIVA_TEST_SERVER_MANAGED: '1',
};
let server;
let runner;
let exitCode = 1;
await control.query(`CREATE SCHEMA ${namespace}`);
try {
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', port],
    { env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  // Don't print server stack traces that might include connection strings.
  let serverFailed = false;
  server.stderr.on('data', () => {
    serverFailed = true;
  });
  server.stdout.resume();
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null)
      throw new Error('The isolated Next.js test server could not start.');
    try {
      if ((await fetch(origin + '/api/auth-config')).ok) break;
    } catch {}
    if (attempt === 119) throw new Error('The isolated test server did not become ready.');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  runner = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    { env, stdio: 'inherit' }
  );
  const [code] = await once(runner, 'exit');
  exitCode = code ?? 1;
  if (serverFailed && exitCode)
    console.log('The test server reported an error. Check the failed HTTP assertions.');
} finally {
  if (runner && runner.exitCode === null) runner.kill('SIGTERM');
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  await control.query(`DROP SCHEMA ${namespace} CASCADE`);
  await control.end();
}
process.exitCode = exitCode;
