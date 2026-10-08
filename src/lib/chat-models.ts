export type UniversityRole = 'Student' | 'Faculty' | 'Researcher' | 'Staff';
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  display?: string;
  fileName?: string | null;
}
export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
}
export interface Attachment {
  truncated?: boolean;
  name: string;
  text: string;
}
export interface AssistantRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: Pick<ChatMessage, 'role' | 'content'>[];
}
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
}

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
