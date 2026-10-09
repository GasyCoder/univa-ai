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
  effort?: Effort;
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
export type Effort = 'low' | 'medium' | 'high' | 'xhigh';
export interface AssistantModel {
  id: string;
  label: string;
  description: string;
  badge: string;
  icon: string;
  /** Claude API list price in USD per million tokens; also micro-USD per token. */
  price: { input: number; output: number };
  /** Reasoning levels this model accepts, mapped to the Claude API `effort` value. */
  reasoning: Partial<Record<ReasoningLevel, Effort>>;
}

const EFFORT: Record<ReasoningLevel, Effort> = {
  fast: 'low',
  medium: 'medium',
  high: 'high',
  extra_high: 'xhigh',
};

export const reasoningLevelsFor = (model: string) =>
  MODELS.find((item) => item.id === model)?.reasoning ?? {};

// Claude API model identifiers and list prices, checked on 2026-10-09.
// UNUVIA never substitutes the model a user selected.
export const MODELS: AssistantModel[] = [
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    description: 'Lessons, writing, and everyday questions.',
    badge: 'Balanced',
    icon: 'sparkles',
    price: { input: 2, output: 10 },
    reasoning: EFFORT,
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    description: 'Deep analysis and complex projects.',
    badge: 'Deep thinking',
    icon: 'layers',
    price: { input: 4, output: 20 },
    reasoning: EFFORT,
  },
  {
    id: 'claude-fable-5-1',
    label: 'Claude Fable 5.1',
    description: 'Demanding research and complex reasoning.',
    badge: 'Research',
    icon: 'flask',
    price: { input: 10, output: 50 },
    reasoning: EFFORT,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    description: 'Quick answers and shorter tasks.',
    badge: 'Fast',
    icon: 'clock',
    price: { input: 0.1, output: 0.5 },
    reasoning: EFFORT,
  },
];

export const FREE_MODEL = 'claude-haiku-5-5';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
/** Cost in micro-USD: cache reads bill at 0.1x input, cache writes at 1.25x. */
export function usageCost(model: string, usage: TokenUsage) {
  const price = MODELS.find((item) => item.id === model)?.price;
  if (!price) return 0;
  return Math.ceil(
    (usage.input + usage.cacheRead * 0.1 + usage.cacheWrite * 1.25) * price.input +
      usage.output * price.output
  );
}
