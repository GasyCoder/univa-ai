import { ChatMessage, type ReasoningLevel, UniversityRole } from './chat-models';
import { buildAssistantRequest } from './assistant-request';
import { AssistantError } from './assistant-errors';

export interface CompleteOptions {
  reasoning?: ReasoningLevel;
  signal?: AbortSignal;
  /** Called with the whole text received so far, as it streams in. */
  onText?: (text: string) => void;
}

export async function completeAssistant(
  messages: ChatMessage[],
  role: UniversityRole,
  model: string,
  { reasoning, signal, onText }: CompleteOptions = {}
): Promise<string> {
  const request = buildAssistantRequest(messages, role, model, reasoning);
  // Retain compatibility with embedded workspaces. Standalone UNUVIA uses its server API.
  if (typeof window.claude?.complete !== 'function') {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, role, messages: request.messages, reasoning }),
      signal,
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new AssistantError(result?.error?.code ?? 'provider_unavailable');
    }
    let text = '';
    if (response.headers.get('content-type')?.includes('application/json')) {
      const result = await response.json().catch(() => null);
      if (typeof result?.content === 'string') text = result.content;
    } else if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          onText?.(text);
        }
        text += decoder.decode();
      } catch (error) {
        // A dropped connection after some text still fails: the answer is incomplete.
        throw signal?.aborted ? error : new AssistantError('provider_unavailable');
      }
    }
    if (!text.trim()) throw new AssistantError('provider_unavailable');
    onText?.(text.trim());
    return text.trim();
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
  onText?.(answer.trim());
  return answer.trim();
}
