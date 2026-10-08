import { ChatMessage, UniversityRole } from './chat-models';
import { buildAssistantRequest } from './assistant-request';
import { AssistantError } from './assistant-errors';

export async function completeAssistant(
  messages: ChatMessage[],
  role: UniversityRole,
  model: string
): Promise<string> {
  const request = buildAssistantRequest(messages, role, model);
  // Retain compatibility with embedded workspaces. Standalone UNUVIA uses its server API.
  if (typeof window.claude?.complete !== 'function') {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, role, messages: request.messages }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new AssistantError(result?.error?.code ?? 'provider_unavailable');
    if (typeof result?.content !== 'string' || !result.content.trim())
      throw new AssistantError('provider_unavailable');
    return result.content.trim();
  }
  const result = await window.claude!.complete(request);
  let answer = '';
  if (typeof result === 'string') answer = result;
  else if (
    result &&
    typeof result === 'object' &&
    'content' in result &&
    Array.isArray(result.content)
  ) {
    answer = result.content
      .filter(
        (b: unknown): b is { type: 'text'; text: string } =>
          !!b &&
          typeof b === 'object' &&
          'type' in b &&
          b.type === 'text' &&
          'text' in b &&
          typeof b.text === 'string'
      )
      .map((b) => b.text)
      .join('\n');
  }
  if (!answer.trim()) throw new Error('EMPTY_RESPONSE');
  return answer.trim();
}
