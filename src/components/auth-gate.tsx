'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccessDialog } from './access-dialog';
import { ThemeToggle } from './theme-provider';
export function AuthGate() {
  const router = useRouter();
  return (
    <main className="auth-gate">
      <header>
        <Link href="/" className="saas-brand">
          UNUVIA
        </Link>
        <ThemeToggle />
      </header>
      <div className="auth-gate-copy">
        <h1>Your workspace starts here.</h1>
        <p>Sign in or create an account to use the UNUVIA assistant.</p>
      </div>
      <AccessDialog
        open
        initialMode="login"
        gate
        onOpenChange={(open) => {
          if (!open) router.push('/');
        }}
      />
    </main>
  );
}
