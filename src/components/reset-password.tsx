'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Spinner } from './ui/spinner';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';

export function ResetPassword({ token }: { token?: string }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: token! });
      if (result.error)
        setError('This link has expired or was already used. Request a new one and try again.');
      else setDone(true);
    } catch {
      setError('Unable to connect. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardDescription>UNUVIA</CardDescription>
          <CardTitle>
            {done
              ? 'Password changed.'
              : token
                ? 'Choose a new password.'
                : 'This link is invalid.'}
          </CardTitle>
        </CardHeader>
        {done || !token ? (
          <>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {done
                  ? 'Your other sessions have been signed out. Log in with your new password.'
                  : 'Reset links work once and expire after an hour. Request a new one from the Log in screen.'}
              </p>
            </CardContent>
            <CardFooter>
              <Button className="min-h-11" asChild>
                <Link href="/assistant">Go to log in</Link>
              </Button>
            </CardFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  className="h-11"
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={busy}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">8 to 128 characters.</p>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button className="min-h-11" type="submit" disabled={busy}>
                {busy && <Spinner />}Change password
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
