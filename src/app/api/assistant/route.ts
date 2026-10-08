import { getAuth, getAuthDatabase } from '@/lib/auth';
import { MODELS, ROLES, type ChatMessage, type UniversityRole } from '@/lib/chat-models';
import { buildAssistantRequest } from '@/lib/assistant-request';
import { completeWithApmix, ApmixError } from '@/lib/apmix';

export const runtime = 'nodejs';

const MAX_BYTES = 2_000_000;
const MAX_CONTENT = 400_000;

function failure(code: string, status: number) {
  return Response.json({ error: { code } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new ApmixError('context_too_large', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const allowedOrigin = new URL(process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4200').origin;
  if (request.headers.get('origin') !== allowedOrigin) return failure('invalid_origin', 403);
  const session = await (await getAuth()).api.getSession({ headers: request.headers });
  if (!session) return failure('sign_in_required', 401);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return failure('invalid_request', 400);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES)
    return failure('context_too_large', 413);
  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return error instanceof ApmixError
      ? failure(error.code, error.status)
      : failure('invalid_request', 400);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !('model' in body) ||
    !('role' in body) ||
    !('messages' in body)
  )
    return failure('invalid_request', 400);
  const { model, role, messages } = body;
  if (
    typeof model !== 'string' ||
    !MODELS.some((item) => item.id === model) ||
    typeof role !== 'string' ||
    !ROLES.some((item) => item.id === role) ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 100
  )
    return failure('invalid_request', 400);
  let total = 0;
  const sanitized: Pick<ChatMessage, 'role' | 'content'>[] = [];
  for (const message of messages) {
    if (
      !message ||
      typeof message !== 'object' ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      !message.content.trim() ||
      message.content.length > 200_000
    )
      return failure('invalid_request', 400);
    total += message.content.length;
    sanitized.push({ role: message.role, content: message.content });
  }
  if (total > MAX_CONTENT) return failure('context_too_large', 413);
  if (sanitized.at(-1)?.role !== 'user') return failure('invalid_request', 400);
  const apiKey = process.env.APMIX_API_KEY?.trim();
  if (!apiKey) return failure('not_configured', 503);

  const database = await getAuthDatabase();
  database.exec(
    'CREATE TABLE IF NOT EXISTS assistant_rate_limits (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, window_start INTEGER NOT NULL, count INTEGER NOT NULL)'
  );
  const window = Math.floor(Date.now() / 60000);
  const permit = database
    .prepare(
      `
    INSERT INTO assistant_rate_limits (user_id, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id) DO UPDATE SET
      count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
      window_start = excluded.window_start
    WHERE window_start != excluded.window_start OR count < 10
  `
    )
    .run(session.user.id, window);
  if (!permit.changes) return failure('rate_limited', 429);

  try {
    const content = await completeWithApmix(
      buildAssistantRequest(sanitized, role as UniversityRole, model),
      apiKey
    );
    return Response.json({ content }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return error instanceof ApmixError
      ? failure(error.code, error.status)
      : failure('provider_unavailable', 502);
  }
}
