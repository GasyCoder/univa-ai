import '@/app/account/account.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/account';
import { SubscriptionAdmin } from '@/components/subscription-admin';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Subscriptions — UNUVIA administration',
  robots: { index: false, follow: false },
};
export default async function AdminPage() {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session || !isAdmin(session.user)) notFound();
  return <SubscriptionAdmin />;
}
