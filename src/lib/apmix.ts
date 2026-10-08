import 'server-only';
import { MODELS, type AssistantRequest } from './chat-models';

let catalog: { key: string; expires: number; pending: Promise<string[] | null> } | undefined;

// Keep the provider key and catalog cache on the server; never serialize the key to the client.
export async function getApmixModelIds(): Promise<string[] | null> {
  const key = process.env.APMIX_API_KEY?.trim();
  if (!key) return null;
  if (catalog?.key === key && catalog.expires > Date.now()) return catalog.pending;
  const pending = (async () => {
    try {
      const response = await fetch('https://api.apmix.ai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data.data)) return null;
      return data.data
        .map((item: unknown) => (item && typeof item === 'object' && 'id' in item ? item.id : null))
        .filter((id: unknown): id is string => typeof id === 'string')
        .map((id: string) => id.replace(/^anthropic\//, ''))
        .filter((id: string) => MODELS.some((model) => model.id === id));
    } catch {
      return null;
    }
  })();
  catalog = { key, expires: Date.now() + 60000, pending };
  return pending;
}

export class ApmixError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = 'ApmixError';
  }
}

function providerError(status: number, data: unknown): ApmixError {
  const providerCode =
    data &&
    typeof data === 'object' &&
    'error' in data &&
    data.error &&
    typeof data.error === 'object'
      ? (data.error as { code?: unknown }).code
      : undefined;
  if (
    typeof providerCode === 'string' &&
    [
      'allowance_exhausted',
      'key_limit_reached',
      'daily_limit_reached',
      'weekly_limit_reached',
    ].includes(providerCode)
  )
    return new ApmixError('quota_exhausted', 429);
  if (status === 401) return new ApmixError('provider_auth', 503);
  if (providerCode === 'model_not_in_plan' || status === 404)
    return new ApmixError('model_unavailable', 400);
  if (status === 429) return new ApmixError('rate_limited', 429);
  if (status === 400) return new ApmixError('invalid_request', 400);
  return new ApmixError('provider_unavailable', 502);
}

const FIRST_TOKEN_MS = 60000;
const IDLE_MS = 60000;

/** Reads the provider's server-sent events as text deltas. */
async function* deltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (!data) continue;
        if (data === '[DONE]') return;
        const event = JSON.parse(data);
        if (event?.error) throw providerError(502, event);
        const text = event?.choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text) yield text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams the answer as plain UTF-8 text. Resolves only once the first text arrives, so a
 * failure or an empty answer is still reported as an HTTP error rather than an empty stream.
 */
export async function streamWithApmix(
  request: AssistantRequest,
  apiKey: string,
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const abort = new AbortController();
  const stop = () => abort.abort();
  signal?.addEventListener('abort', stop, { once: true });
  let timer = setTimeout(stop, FIRST_TOKEN_MS);
  const fail = (error: unknown): never => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    if (error instanceof ApmixError) throw error;
    const timeout = abort.signal.aborted && !signal?.aborted;
    throw new ApmixError(timeout ? 'timeout' : 'provider_unavailable', timeout ? 504 : 502);
  };
  let iterator: AsyncGenerator<string>;
  let first: string;
  try {
    const response = await fetch('https://api.apmix.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.max_tokens,
        stream: true,
        ...(request.reasoning_effort ? { reasoning_effort: request.reasoning_effort } : {}),
        messages: [{ role: 'system', content: request.system }, ...request.messages],
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: abort.signal,
    });
    if (!response.ok) throw providerError(response.status, await response.json().catch(() => null));
    // A provider that ignores `stream` answers with one JSON object.
    if (response.headers.get('content-type')?.includes('application/json')) {
      const content = (await response.json())?.choices?.[0]?.message?.content;
      iterator = (async function* () {
        if (typeof content === 'string') yield content;
      })();
    } else if (response.body) iterator = deltas(response.body);
    else throw new ApmixError('provider_unavailable', 502);
    first = '';
    while (!first.trim()) {
      const next = await iterator.next();
      if (next.done) throw new ApmixError('provider_unavailable', 502);
      first += next.value;
    }
  } catch (error) {
    return fail(error);
  }
  const encoder = new TextEncoder();
  const restart = () => {
    clearTimeout(timer);
    timer = setTimeout(stop, IDLE_MS);
  };
  restart();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(first.trimStart()));
    },
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          clearTimeout(timer);
          controller.close();
        } else {
          restart();
          controller.enqueue(encoder.encode(next.value));
        }
      } catch (error) {
        clearTimeout(timer);
        controller.error(error);
      }
    },
    cancel() {
      clearTimeout(timer);
      stop();
    },
  });
}
