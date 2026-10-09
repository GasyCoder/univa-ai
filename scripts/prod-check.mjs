// Checks a production configuration without printing any secret. Run it on the server:
//   node scripts/prod-check.mjs
import nextEnv from '@next/env';
import Anthropic from '@anthropic-ai/sdk';
import nodemailer from 'nodemailer';
import pg from 'pg';
nextEnv.loadEnvConfig(process.cwd(), false);

const env = (name) => process.env[name]?.trim() || '';
let failed = false;
function report(ok, label, detail = '') {
  if (ok === false) failed = true;
  console.log(
    `${ok === null ? 'SKIP' : ok ? ' OK ' : 'FAIL'}  ${label}${detail && ' — ' + detail}`
  );
}

report(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22 or later', process.version);
report(env('BETTER_AUTH_SECRET').length >= 32, 'BETTER_AUTH_SECRET has at least 32 characters');
let origin = '';
try {
  const url = new URL(env('BETTER_AUTH_URL'));
  origin = url.origin;
  report(url.protocol === 'https:', 'BETTER_AUTH_URL is the public https address', origin);
} catch {
  report(false, 'BETTER_AUTH_URL is the public https address', 'missing or invalid');
}

if (!env('DATABASE_URL')) report(false, 'DATABASE_URL', 'missing');
else {
  const pool = new pg.Pool({
    connectionString: env('DATABASE_URL'),
    connectionTimeoutMillis: 8000,
  });
  try {
    const version = (await pool.query('SHOW server_version')).rows[0].server_version;
    report(true, 'PostgreSQL connection', `server ${version}`);
    await pool.query('CREATE TABLE IF NOT EXISTS unuvia_check (id INT); DROP TABLE unuvia_check');
    report(true, 'PostgreSQL role can create tables');
  } catch (error) {
    report(false, 'PostgreSQL', error.code || 'connection failed');
  } finally {
    await pool.end();
  }
}

if (!env('ANTHROPIC_API_KEY')) report(false, 'ANTHROPIC_API_KEY', 'missing');
else
  try {
    const ids = [];
    for await (const model of new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') }).models.list({
      limit: 100,
    }))
      ids.push(model.id);
    const wanted = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'];
    const missing = wanted.filter((id) => !ids.includes(id));
    report(
      !missing.length,
      'Claude API key and models',
      missing.length ? `missing ${missing}` : ''
    );
  } catch (error) {
    report(
      false,
      'Claude API key',
      error instanceof Anthropic.APIError ? `HTTP ${error.status}` : 'unreachable'
    );
  }

if (!env('SMTP_HOST')) report(null, 'SMTP', 'not configured: no account or payment emails');
else
  try {
    const port = Number(env('SMTP_PORT')) || 465;
    await nodemailer
      .createTransport({
        host: env('SMTP_HOST'),
        port,
        secure: port === 465,
        auth: { user: env('SMTP_USER'), pass: process.env.SMTP_PASSWORD },
        connectionTimeout: 15000,
      })
      .verify();
    report(true, 'SMTP login');
  } catch (error) {
    report(false, 'SMTP login', error.code || 'failed');
  }

report(
  env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') ? true : null,
  'Google sign-in',
  env('GOOGLE_CLIENT_ID')
    ? `authorize ${origin}/api/auth/callback/google in Google Cloud`
    : 'not configured'
);
report(
  env('ADMIN_EMAILS') ? true : null,
  'ADMIN_EMAILS',
  env('ADMIN_EMAILS') ? '' : 'nobody can review payments'
);
report(
  env('PAYMENT_MOBILE_MONEY_INSTRUCTIONS') || env('PAYMENT_CARD_INSTRUCTIONS') ? true : null,
  'Payment instructions',
  env('PAYMENT_MOBILE_MONEY_INSTRUCTIONS') || env('PAYMENT_CARD_INSTRUCTIONS')
    ? ''
    : 'none: the Plan tab shows payments as unavailable'
);
console.log(
  failed ? '\nFix the FAIL lines before opening the site.' : '\nConfiguration is usable.'
);
process.exitCode = failed ? 1 : 0;
