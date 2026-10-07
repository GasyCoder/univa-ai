import { getAuth, getAuthDatabase } from '@/lib/auth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const allowedOrigin = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4200';
  if (request.headers.get('origin') !== new URL(allowedOrigin).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const session = await (await getAuth()).api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const database = await getAuthDatabase();
  database.exec(
    'CREATE TABLE IF NOT EXISTS pro_waitlist (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, created_at TEXT NOT NULL)'
  );
  database
    .prepare('INSERT OR IGNORE INTO pro_waitlist (user_id, created_at) VALUES (?, ?)')
    .run(session.user.id, new Date().toISOString());
  return Response.json({ joined: true });
}
