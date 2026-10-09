import { getAuthDatabase } from '@/lib/auth';
import { assistantAccess, apiFailure, recordUsage, requireAccount, usageFor } from '@/lib/account';
import { PLANS } from '@/lib/plans';
import {
  MODELS,
  ROLES,
  reasoningLevelsFor,
  type ChatMessage,
  type ReasoningLevel,
  type UniversityRole,
} from '@/lib/chat-models';
import { buildAssistantRequest } from '@/lib/assistant-request';
import { streamWithClaude, ClaudeError } from '@/lib/claude';

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
        throw new ClaudeError('context_too_large', 413);
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
  let user;
  try {
    user = await requireAccount(request, true);
  } catch (error) {
    return apiFailure(error);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return failure('invalid_request', 400);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES)
    return failure('context_too_large', 413);
  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return error instanceof ClaudeError
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
  const reasoning = 'reasoning' in body ? body.reasoning : undefined;
  if (
    typeof model !== 'string' ||
    !MODELS.some((item) => item.id === model) ||
    typeof role !== 'string' ||
    !ROLES.some((item) => item.id === role) ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 100 ||
    // A reasoning level is only accepted for a model that supports it.
    (reasoning !== undefined &&
      (typeof reasoning !== 'string' || !(reasoning in reasoningLevelsFor(model))))
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
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return failure('not_configured', 503);

  try {
    const { plan, modelIds } = await assistantAccess(user.id, null);
    if (!modelIds.includes(model)) return failure('model_not_allowed', 403);
    if ((await usageFor(user.id, plan)).percent >= 100) return failure('usage_limit', 429);
    const database = await getAuthDatabase();
    const window = Math.floor(Date.now() / 60000);
    const permit = await database.query(
      `
      INSERT INTO assistant_rate_limits (user_id, window_start, count) VALUES ($1, $2, 1)
      ON CONFLICT(user_id) DO UPDATE SET
        count = CASE WHEN assistant_rate_limits.window_start = excluded.window_start THEN assistant_rate_limits.count + 1 ELSE 1 END,
        window_start = excluded.window_start
      WHERE assistant_rate_limits.window_start != excluded.window_start OR assistant_rate_limits.count < $3
      RETURNING user_id
    `,
      [user.id, window, PLANS[plan].requestsPerMinute]
    );
    if (!permit.rowCount) return failure('rate_limited', 429);
  } catch (error) {
    return apiFailure(error);
  }

  try {
    const stream = await streamWithClaude(
      buildAssistantRequest(
        sanitized,
        role as UniversityRole,
        model,
        reasoning as ReasoningLevel | undefined
      ),
      apiKey,
      request.signal,
      (usage) =>
        void recordUsage(user.id, model, usage).catch(() =>
          console.error('Assistant usage could not be recorded.')
        )
    );
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return error instanceof ClaudeError
      ? failure(error.code, error.status)
      : failure('provider_unavailable', 502);
  }
}
