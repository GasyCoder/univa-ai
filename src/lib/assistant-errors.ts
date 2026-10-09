const messages: Record<string, string> = {
  not_configured: 'The assistant isn’t connected yet. Your question and attachment are still here.',
  sign_in_required: 'Your session has expired. Please log in again to continue.',
  invalid_request: 'This conversation could not be sent. Start a new chat or shorten your message.',
  context_too_large: 'This conversation is too long. Start a new chat or use a shorter document.',
  provider_auth: 'The assistant connection needs attention. Please contact the workspace owner.',
  database_unavailable: 'Your workspace is temporarily unavailable. Please try again shortly.',
  model_not_allowed:
    'This model needs an active Pro plan. Choose a Free model or open your subscription settings.',
  model_unavailable:
    'This model is unavailable for this workspace. Choose another model and try again.',
  usage_limit:
    'You have reached your plan’s usage limit for now. It frees up again over time; see your Plan tab.',
  refused: 'The assistant cannot help with this request. Try rephrasing your question.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  timeout: 'The response took too long. Please try again.',
  provider_unavailable: 'The assistant could not respond. Please try again in a moment.',
};

export class AssistantError extends Error {
  constructor(public readonly code: string) {
    super(messages[code] ?? messages.provider_unavailable);
    this.name = 'AssistantError';
  }
}
