import 'server-only';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';

export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
);

function makeAuth() {
  const path = resolve(
    /* turbopackIgnore: true */ process.env.AUTH_DATABASE_PATH || '.data/univa.sqlite'
  );
  mkdirSync(dirname(path), { recursive: true });
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
  const database = new Database(path);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  const instance = betterAuth({
    appName: 'UNUVIA',
    secret,
    baseURL: process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4200',
    database,
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
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
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  });
  return {
    instance,
    database,
    ready: getMigrations(instance.options).then(({ runMigrations }) => runMigrations()),
  };
}

// Keep one database and one migration promise through development hot reloads.
const globalAuth = globalThis as typeof globalThis & { univaAuth?: ReturnType<typeof makeAuth> };
export async function getAuth() {
  if (!globalAuth.univaAuth?.database) globalAuth.univaAuth = makeAuth();
  await globalAuth.univaAuth.ready;
  return globalAuth.univaAuth.instance;
}
export async function getAuthDatabase() {
  await getAuth();
  return globalAuth.univaAuth!.database;
}
