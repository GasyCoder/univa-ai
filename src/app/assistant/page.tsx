import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getAuth } from '@/lib/auth';
import { Assistant } from '@/components/assistant';
import { AuthGate } from '@/components/auth-gate';
import { accountData, assistantAccess } from '@/lib/account';
import './workspace.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'UNUVIA — AI Workspace for Universities',
  robots: { index: false, follow: false },
};
export default async function AssistantPage() {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session) return <AuthGate />;
  const account = await accountData(session.user, requestHeaders.get('accept-language'));
  const { modelIds } = await assistantAccess(session.user.id, account.providerModelIds);
  return (
    <Assistant
      key={session.user.id}
      user={account.user}
      account={JSON.parse(JSON.stringify(account))}
      availableModels={modelIds}
    />
  );
}
