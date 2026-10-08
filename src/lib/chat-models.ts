export type UniversityRole = 'Student' | 'Faculty' | 'Researcher' | 'Staff';
/** A user file kept in the browser (IndexedDB); only this reference is saved with the chat. */
export interface FileRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  display?: string;
  fileName?: string | null;
  attachment?: FileRef;
  /** The user stopped the response before it finished. */
  stopped?: boolean;
}
export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
}
export interface Attachment extends FileRef {
  truncated?: boolean;
  text: string;
  /** The original file, in memory until the message is sent. */
  file?: File;
}
export interface AssistantRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: Pick<ChatMessage, 'role' | 'content'>[];
  reasoning_effort?: string;
}

export type ReasoningLevel = 'fast' | 'medium' | 'high' | 'extra_high';
export const REASONING_LEVELS: { id: ReasoningLevel; label: string; description: string }[] = [
  { id: 'fast', label: 'Fast', description: 'Quick answers with little deliberation.' },
  { id: 'medium', label: 'Medium', description: 'A balance of speed and depth.' },
  { id: 'high', label: 'High', description: 'Thinks longer before answering.' },
  { id: 'extra_high', label: 'Extra High', description: 'The deepest reasoning, slowest.' },
];
export interface AssistantBridge {
  complete(request: AssistantRequest): Promise<unknown>;
}
declare global {
  interface Window {
    claude?: AssistantBridge;
  }
}

export const ROLES: { id: UniversityRole; label: string; icon: string; focus: string }[] = [
  {
    id: 'Student',
    label: 'Student',
    icon: 'school',
    focus:
      'a student. Explain clearly, check understanding, and support learning rather than completing graded work.',
  },
  {
    id: 'Faculty',
    label: 'Educator',
    icon: 'book',
    focus: 'an educator. Help prepare lessons, activities, assessments, and analyze documents.',
  },
  {
    id: 'Researcher',
    label: 'Researcher',
    icon: 'flask',
    focus: 'a researcher. Help structure literature, methods, and writing. Never invent citations.',
  },
  {
    id: 'Staff',
    label: 'Staff',
    icon: 'briefcase',
    focus: 'a staff member. Help prepare reports, notes, procedures, and clear responses.',
  },
];
export interface AssistantModel {
  id: string;
  label: string;
  description: string;
  badge: string;
  icon: string;
  legacy?: boolean;
  /** Reasoning levels this model accepts, mapped to the provider's `reasoning_effort` value. */
  reasoning?: Partial<Record<ReasoningLevel, string>>;
}

// Checked against APMIX on 2026-10-08: claude-sonnet-4-6-free accepts `reasoning_effort` but
// ignores it (no reasoning tokens); the other models are not in the current key's plan.
// Add a mapping only once a model is verified to reason, e.g. { fast: 'low', high: 'high' }.
export const reasoningLevelsFor = (model: string) =>
  MODELS.find((item) => item.id === model)?.reasoning ?? {};

// API identifiers checked against the APMIX catalog on 2026-10-08.
// APMIX plan permissions are enforced by the provider; UNUVIA never substitutes models.
export const MODELS: AssistantModel[] = [
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    description: 'Lessons, writing, and everyday questions.',
    badge: 'Balanced',
    icon: 'sparkles',
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    description: 'Deep analysis and complex projects.',
    badge: 'Deep thinking',
    icon: 'layers',
  },
  {
    id: 'claude-fable-5-1',
    label: 'Claude Fable 5.1',
    description: 'Demanding research and complex reasoning.',
    badge: 'Research',
    icon: 'flask',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    description: 'Quick answers and shorter tasks.',
    badge: 'Fast',
    icon: 'clock',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description: 'For services using this earlier version.',
    badge: 'Previous version',
    icon: 'clock',
    legacy: true,
  },
  {
    id: 'claude-sonnet-4-6-free',
    label: 'Claude Sonnet 4.6 Free',
    description: 'Available on GasyCoderAI, within your workspace limits.',
    badge: 'Free plan',
    icon: 'book',
  },
];

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
