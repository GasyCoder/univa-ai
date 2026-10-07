import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getAuth } from '@/lib/auth';
import { Assistant } from '@/components/assistant';
import { AuthGate } from '@/components/auth-gate';
export const metadata: Metadata = {
  title: 'UNUVIA — AI Workspace for Universities',
  robots: { index: false, follow: false },
};
export default async function AssistantPage() {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  return session ? (
    <Assistant
      key={session.user.id}
      user={{ id: session.user.id, name: session.user.name, email: session.user.email }}
    />
  ) : (
    <AuthGate />
  );
}
