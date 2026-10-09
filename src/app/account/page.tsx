import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getAuth } from '@/lib/auth';
import { accountData } from '@/lib/account';
import { AccountSettings } from '@/components/account-settings';
import { AuthGate } from '@/components/auth-gate';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your account | UNUVIA',
  robots: { index: false, follow: false },
};
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const h = await headers();
  const session = await (await getAuth()).api.getSession({ headers: h });
  if (!session) return <AuthGate />;
  const data = await accountData(session.user, h.get('accept-language'));
  return (
    <AccountSettings
      initial={JSON.parse(JSON.stringify(data))}
      initialTab={(await searchParams).tab}
    />
  );
}
