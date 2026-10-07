import { Chat, ChatMessage, DEFAULT_MODEL, MODELS, ROLES, UniversityRole } from './chat-models';

const store = (userId: string) => `univa-chats-v2:${userId}`;
const isMessage = (m: unknown): m is ChatMessage =>
  !!m &&
  typeof m === 'object' &&
  'role' in m &&
  (m.role === 'user' || m.role === 'assistant') &&
  'content' in m &&
  typeof m.content === 'string';

export function loadChats(userId: string): { chats: Chat[]; role: UniversityRole; model: string } {
  const fallback = {
    chats: [] as Chat[],
    role: 'Faculty' as UniversityRole,
    model: DEFAULT_MODEL,
  };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(store(userId)) ?? 'null');
    if (!saved || typeof saved !== 'object' || !('chats' in saved) || !Array.isArray(saved.chats))
      return fallback;
    const chats: Chat[] = saved.chats
      .filter(
        (c: unknown): c is Chat =>
          !!c &&
          typeof c === 'object' &&
          'id' in c &&
          typeof c.id === 'string' &&
          'title' in c &&
          typeof c.title === 'string' &&
          'messages' in c &&
          Array.isArray(c.messages) &&
          c.messages.every(isMessage)
      )
      .slice(0, 30);
    const role =
      'role' in saved && ROLES.some((r) => r.id === saved.role)
        ? (saved.role as UniversityRole)
        : fallback.role;
    const model =
      'model' in saved && MODELS.some((m) => m.id === saved.model)
        ? (saved.model as string)
        : fallback.model;
    return { chats, role, model };
  } catch {
    return fallback;
  }
}
export function saveChats(
  chats: Chat[],
  role: UniversityRole,
  model: string,
  userId: string
): boolean {
  try {
    localStorage.setItem(store(userId), JSON.stringify({ chats: chats.slice(0, 30), role, model }));
    return true;
  } catch {
    return false;
  }
}
