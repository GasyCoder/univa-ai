import 'server-only';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { getPool } from './db';
import { schema } from './schema';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';

export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
);

function makeAuth() {
  let secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Set BETTER_AUTH_SECRET before starting production.');
    const secretPath = resolve('.data/auth-secret');
    mkdirSync(dirname(secretPath), { recursive: true });
    try {
      secret = readFileSync(secretPath, 'utf8');
    } catch {
      secret = randomBytes(48).toString('hex');
      writeFileSync(secretPath, secret, { mode: 0o600, flag: 'wx' });
    }
  }
  const database = getPool();
  const instance = betterAuth({
    appName: 'UNUVIA',
    secret,
    baseURL: process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4200',
    database,
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
    user: { deleteUser: { enabled: true } },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
            prompt: 'select_account',
            // Offline access keeps Google Drive usable after the first hour (refresh token).
            accessType: 'offline',
          },
        }
      : {},
    // Lets an email/password user connect a Google account (for Drive) with another address.
    account: { accountLinking: { enabled: true, allowDifferentEmails: true } },
    rateLimit: { enabled: true, storage: 'database' },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, freshAge: 300 },
  });
  async function initialize() {
    const client = await database.connect();
    try {
      // Serialize initialization across workers without racing Better Auth migrations.
      await client.query('SELECT pg_advisory_lock(85719203)');
      const { runMigrations } = await getMigrations(instance.options);
      await runMigrations();
      await client.query(schema);
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock(85719203)');
      } catch {
        client.release(true);
        throw new Error('Database initialization interrupted.');
      }
      client.release();
    }
  }
  return {
    instance,
    database,
    schema,
    ready: initialize(),
  };
}

// Keep one database and one migration promise through development hot reloads; an edited
// schema is applied again without restarting the server.
const globalAuth = globalThis as typeof globalThis & {
  unuviaPostgresAuth?: ReturnType<typeof makeAuth>;
};
export async function getAuth() {
  if (globalAuth.unuviaPostgresAuth?.schema !== schema) globalAuth.unuviaPostgresAuth = makeAuth();
  const auth = globalAuth.unuviaPostgresAuth;
  try {
    await auth.ready;
  } catch (error) {
    if (globalAuth.unuviaPostgresAuth === auth) globalAuth.unuviaPostgresAuth = undefined;
    throw error;
  }
  return auth.instance;
}
export async function getAuthDatabase() {
  await getAuth();
  return globalAuth.unuviaPostgresAuth!.database;
}
