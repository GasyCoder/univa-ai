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

export async function completeWithApmix(
  request: AssistantRequest,
  apiKey: string
): Promise<string> {
  let response: Response;
  try {
    response = await fetch('https://api.apmix.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.max_tokens,
        stream: false,
        messages: [{ role: 'system', content: request.system }, ...request.messages],
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    const timeout = error instanceof Error && /timeout|abort/i.test(error.name);
    throw new ApmixError(timeout ? 'timeout' : 'provider_unavailable', timeout ? 504 : 502);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const providerCode = data?.error?.code;
    if (
      [
        'allowance_exhausted',
        'key_limit_reached',
        'daily_limit_reached',
        'weekly_limit_reached',
      ].includes(providerCode)
    )
      throw new ApmixError('quota_exhausted', 429);
    if (response.status === 401) throw new ApmixError('provider_auth', 503);
    if (providerCode === 'model_not_in_plan' || response.status === 404)
      throw new ApmixError('model_unavailable', 400);
    if (response.status === 429) throw new ApmixError('rate_limited', 429);
    if (response.status === 400) throw new ApmixError('invalid_request', 400);
    throw new ApmixError('provider_unavailable', 502);
  }
  const content = data?.choices?.[0]?.message?.content;
  const answer = typeof content === 'string' ? content : '';
  if (!answer.trim()) throw new ApmixError('provider_unavailable', 502);
  return answer.trim();
}
