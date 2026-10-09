'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { authClient } from '@/lib/auth-client';
import { AssistantLink } from './assistant-link';

export type AuthMode = 'signup' | 'login';
export function AccessDialog({
  open,
  onOpenChange,
  initialMode = 'signup',
  gate = false,
  proIntent = false,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: AuthMode;
  gate?: boolean;
  proIntent?: boolean;
  returnFocus?: React.RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [google, setGoogle] = useState<boolean | null>(null);
  const [providerError, setProviderError] = useState(false);
  const [providerAttempt, setProviderAttempt] = useState(0);
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError('');
      setSuccess(false);
    }
  }, [open, initialMode]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setGoogle(null);
    setProviderError(false);
    fetch('/api/auth-config', { cache: 'no-store', signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Unable to load sign-in options');
        return r.json();
      })
      .then((data) => setGoogle(data.googleEnabled === true))
      .catch(() => {
        if (!controller.signal.aborted) setProviderError(true);
      });
    return () => controller.abort();
  }, [open, providerAttempt]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const name = String(data.get('name') || '').trim();
    try {
      const result =
        mode === 'signup'
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          result.error.status === 429
            ? 'Too many attempts. Please wait a moment and try again.'
            : mode === 'login'
              ? 'We couldn’t sign you in. Check your email and password and try again.'
              : result.error.code === 'USER_ALREADY_EXISTS' ||
                  result.error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
                ? 'This email already has an account. Switch to Log in.'
                : result.error.status === 429
                  ? 'Too many attempts. Please wait a moment and try again.'
                  : 'We couldn’t create your account. Check your details and try again.'
        );
      } else if (gate) {
        router.refresh();
      } else {
        if (proIntent) {
          router.push('/account?tab=subscription');
          return;
        }
        setSuccess(true);
      }
    } catch {
      setError('Unable to connect. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  async function googleLogin() {
    if (busy || google !== true) return;
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: gate
          ? window.location.pathname + window.location.search
          : proIntent
            ? '/account?tab=subscription'
            : '/',
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? 'Too many sign-in attempts. Please wait a moment and try Google again.'
            : result.error.code === 'INVALID_ORIGIN' || result.error.code === 'INVALID_CALLBACK_URL'
              ? 'The sign-in address has changed. Reload this page and try Google again.'
              : result.error.status === 503
                ? 'Sign-in is temporarily unavailable. Please try again shortly.'
                : 'Google sign-in could not start. Please try again or use email.'
        );
        setBusy(false);
      }
    } catch {
      setError('Google sign-in is unavailable. Please use email.');
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent
        className="auth-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          if (returnFocus) {
            event.preventDefault();
            const target = returnFocus.current?.isConnected
              ? returnFocus.current
              : document.querySelector<HTMLElement>('button[aria-label="Open menu"]');
            target?.focus();
          }
        }}
      >
        <div className="auth-brand">
          <img src="/assets/univa-icon.png" width="34" height="34" alt="UNUVIA logo" />
          <span>UNUVIA</span>
        </div>
        <DialogTitle>
          {success ? 'You’re in.' : mode === 'signup' ? 'Create an account.' : 'Log in.'}
        </DialogTitle>
        <DialogDescription>
          {success
            ? 'Your account is ready. Open your workspace to get started.'
            : proIntent
              ? 'Create an account or log in to view Pro payment options.'
              : mode === 'signup'
                ? 'Create your free account. Any email address works.'
                : 'Enter your email and password to continue.'}
        </DialogDescription>
        {success ? (
          <div className="auth-success">
            <span>
              <Check />
            </span>
            <Button asChild className="saas-primary min-h-11 min-h-11">
              <AssistantLink>
                Open workspace <ArrowRight size={16} />
              </AssistantLink>
            </Button>
          </div>
        ) : (
          <>
            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as AuthMode);
                setError('');
              }}
            >
              <TabsList className="auth-tabs w-full">
                <TabsTrigger value="signup" disabled={busy}>
                  Register
                </TabsTrigger>
                <TabsTrigger value="login" disabled={busy}>
                  Log in
                </TabsTrigger>
              </TabsList>
              {(['signup', 'login'] as const).map((value) => (
                <TabsContent key={value} value={value} className="auth-panel">
                  {value === mode && (
                    <>
                      <Button
                        variant="outline"
                        className="google-button w-full min-h-11 min-h-11"
                        disabled={google !== true || busy}
                        onClick={googleLogin}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fill="#4285F4"
                            d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4Z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a6 6 0 0 1-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.9c1.5 0 2.9.5 3.9 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.4L6.4 10A6 6 0 0 1 12 5.9Z"
                          />
                        </svg>
                        Continue with Google
                      </Button>
                      {google === null && !providerError && (
                        <p className="auth-provider-note" role="status">
                          Checking sign-in options…
                        </p>
                      )}
                      {providerError && (
                        <div className="auth-provider-retry">
                          <p className="auth-provider-note">Couldn’t load Google sign-in.</p>
                          <Button
                            className="min-h-11"
                            variant="ghost"
                            onClick={() => setProviderAttempt((value) => value + 1)}
                          >
                            Try again
                          </Button>
                        </div>
                      )}
                      {google === false && (
                        <p className="auth-provider-note">
                          Google sign-in isn’t enabled for this site yet. Continue with email.
                        </p>
                      )}
                      <div className="auth-divider">
                        <span>or continue with email</span>
                      </div>
                      <form onSubmit={submit} className="auth-form" key={mode}>
                        {mode === 'signup' && (
                          <div>
                            <Label htmlFor="auth-name">Full name</Label>
                            <Input
                              className="h-11"
                              id="auth-name"
                              name="name"
                              autoComplete="name"
                              placeholder="Your name"
                              minLength={2}
                              maxLength={100}
                              required
                              disabled={busy}
                            />
                          </div>
                        )}
                        <div>
                          <Label htmlFor="auth-email">Email</Label>
                          <Input
                            className="h-11"
                            id="auth-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            maxLength={254}
                            required
                            disabled={busy}
                          />
                        </div>
                        <div>
                          <Label htmlFor="auth-password">Password</Label>
                          <Input
                            className="h-11"
                            id="auth-password"
                            name="password"
                            type="password"
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                            minLength={8}
                            maxLength={128}
                            placeholder={
                              mode === 'signup' ? 'At least 8 characters' : 'Your password'
                            }
                            required
                            disabled={busy}
                          />
                        </div>
                        {error && (
                          <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                          </Alert>
                        )}
                        <Button
                          type="submit"
                          className="saas-primary min-h-11 min-h-11"
                          disabled={busy}
                        >
                          {busy ? <LoaderCircle className="animate-spin" size={18} /> : null}
                          {busy
                            ? 'Please wait…'
                            : mode === 'signup'
                              ? 'Create free account'
                              : 'Log in'}
                          {!busy && <ArrowRight size={16} />}
                        </Button>
                      </form>
                      <p className="auth-footnote">
                        {mode === 'signup'
                          ? 'No university email required. No credit card needed.'
                          : 'Your workspace is one step away.'}
                      </p>
                    </>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
