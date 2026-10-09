import type { Metadata } from 'next';
import { ResetPassword } from '@/components/reset-password';

export const metadata: Metadata = {
  title: 'Reset your password — UNUVIA',
  robots: { index: false, follow: false },
};
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return <ResetPassword token={error ? undefined : token} />;
}
