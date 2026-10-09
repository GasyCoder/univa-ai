import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { MODELS, type AssistantRequest, type TokenUsage } from './chat-models';

let cached: { key: string; client: Anthropic } | undefined;

// Keep the Claude API key on the server; never serialize it to the client.
function clientFor(apiKey: string) {
  if (cached?.key !== apiKey) cached = { key: apiKey, client: new Anthropic({ apiKey, fetch }) };
  return cached.client;
}

let catalog: { key: string; expires: number; pending: Promise<string[] | null> } | undefined;

/** The configured models this API key can use, or null when the catalog cannot be read. */
export async function getClaudeModelIds(): Promise<string[] | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (catalog?.key === key && catalog.expires > Date.now()) return catalog.pending;
  const pending = (async () => {
    try {
      const ids: string[] = [];
      for await (const model of clientFor(key).models.list({ limit: 100 }, { timeout: 10000 }))
        ids.push(model.id);
      return MODELS.map((model) => model.id).filter((id) => ids.includes(id));
    } catch {
      return null;
    }
  })();
  catalog = { key, expires: Date.now() + 60000, pending };
  return pending;
}

export class ClaudeError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = 'ClaudeError';
  }
}

function claudeError(error: unknown, timedOut: boolean): ClaudeError {
  if (error instanceof ClaudeError) return error;
  if (timedOut || error instanceof Anthropic.APIConnectionTimeoutError)
    return new ClaudeError('timeout', 504);
  if (error instanceof Anthropic.AuthenticationError) return new ClaudeError('provider_auth', 503);
  if (error instanceof Anthropic.PermissionDeniedError)
    return new ClaudeError('provider_auth', 503);
  if (error instanceof Anthropic.NotFoundError) return new ClaudeError('model_unavailable', 400);
  if (error instanceof Anthropic.RateLimitError) return new ClaudeError('rate_limited', 429);
  if (error instanceof Anthropic.APIError && error.status === 413)
    return new ClaudeError('context_too_large', 413);
  if (error instanceof Anthropic.BadRequestError) return new ClaudeError('invalid_request', 400);
  return new ClaudeError('provider_unavailable', 502);
}

const IDLE_MS = 90000;
// Server-side refusal fallback; Claude Haiku 5.5 has none.
const FALLBACK_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'];
export const CUT_OFF_NOTICE =
  '\n\n*The answer reached the length limit and was cut off. Ask the assistant to continue.*';
export const REFUSAL_NOTICE = '\n\n*The assistant stopped: it cannot continue with this request.*';

/**
 * Streams the answer as plain UTF-8 text. Resolves only once the first text arrives, so a
 * failure, a refusal or an empty answer is still reported as an HTTP error rather than an
 * empty stream. `onUsage` is called once with the tokens billed, including after a stop.
 */
export async function streamWithClaude(
  request: AssistantRequest,
  apiKey: string,
  signal: AbortSignal | undefined,
  onUsage: (usage: TokenUsage) => void
): Promise<ReadableStream<Uint8Array>> {
  const abort = new AbortController();
  let timedOut = false;
  const stop = () => abort.abort();
  signal?.addEventListener('abort', stop, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  const restart = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, IDLE_MS);
  };
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let stopReason: string | null = null;
  let characters = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    // A stopped answer never reports its output tokens; estimate them from the text sent.
    if (!stopReason && !usage.output) usage.output = Math.ceil(characters / 3);
    if (usage.input || usage.output || usage.cacheRead || usage.cacheWrite) onUsage(usage);
  };

  const fallback = FALLBACK_MODELS.includes(request.model);
  restart();
  const stream = clientFor(apiKey).beta.messages.stream(
    {
      model: request.model,
      max_tokens: request.max_tokens,
      system: request.system,
      messages: request.messages,
      // Caches the conversation prefix, so follow-up questions on a long document cost less.
      cache_control: { type: 'ephemeral' },
      ...(request.effort ? { output_config: { effort: request.effort } } : {}),
      ...(fallback
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    },
    { signal: abort.signal, maxRetries: 1 }
  );
  const events = stream[Symbol.asyncIterator]();

  /** The next text delta, or null at the end of the answer. */
  async function nextText(): Promise<string | null> {
    while (true) {
      const next = await events.next();
      if (next.done) return null;
      restart();
      const event = next.value;
      if (event.type === 'message_start') {
        const start = event.message.usage;
        usage.input = start.input_tokens;
        usage.cacheRead = start.cache_read_input_tokens ?? 0;
        usage.cacheWrite = start.cache_creation_input_tokens ?? 0;
      } else if (event.type === 'message_delta') {
        usage.output = event.usage.output_tokens;
        stopReason = event.delta.stop_reason;
      } else if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        event.delta.text
      ) {
        characters += event.delta.text.length;
        return event.delta.text;
      }
    }
  }

  let first = '';
  try {
    while (!first.trim()) {
      const text = await nextText();
      if (text === null)
        throw new ClaudeError(
          stopReason === 'refusal' ? 'refused' : 'provider_unavailable',
          stopReason === 'refusal' ? 422 : 502
        );
      first += text;
    }
  } catch (error) {
    finish();
    throw claudeError(error, timedOut);
  }
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(first.trimStart()));
    },
    async pull(controller) {
      try {
        const text = await nextText();
        if (text !== null) return controller.enqueue(encoder.encode(text));
        if (stopReason === 'max_tokens') controller.enqueue(encoder.encode(CUT_OFF_NOTICE));
        if (stopReason === 'refusal') controller.enqueue(encoder.encode(REFUSAL_NOTICE));
        finish();
        controller.close();
      } catch (error) {
        finish();
        controller.error(error);
      }
    },
    cancel() {
      stop();
      finish();
    },
  });
}
