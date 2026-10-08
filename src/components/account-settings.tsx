'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CreditCard,
  Loader2,
  Settings,
  User,
  Upload,
  Trash2,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { COUNTRIES, PLANS, type AccountData } from '@/lib/plans';
import { MODELS, ROLES, REASONING_LEVELS, reasoningLevelsFor } from '@/lib/chat-models';
import {
  accountRequest,
  displayDate,
  paymentAmount,
  type PaymentRecord,
} from '@/lib/account-client';
import { pruneFiles } from '@/lib/file-store';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { ThemeToggle } from './theme-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const selectClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';
const validTabs = ['profile', 'preferences', 'subscription'];
export function AccountSettings({
  initial,
  initialTab,
}: {
  initial: AccountData;
  initialTab?: string;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [data, setData] = useState(initial);
  const [profile, setProfile] = useState(initial.profile);
  const [name, setName] = useState(initial.user.name);
  const [image, setImage] = useState(initial.user.image);
  const [tab, setTab] = useState(validTabs.includes(initialTab || '') ? initialTab! : 'profile');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<PaymentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [method, setMethod] = useState(initial.paymentMethods[0]?.id || '');
  const [reference, setReference] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const allowedIds = PLANS[data.plan].modelIds.filter(
    (id) => data.providerModelIds === null || data.providerModelIds.includes(id)
  );
  const allowedModels = MODELS.filter((model) => allowedIds.includes(model.id));
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const countries = COUNTRIES.map((code) => ({ code, label: displayNames.of(code) || code })).sort(
    (a, b) => a.label.localeCompare(b.label)
  );
  const pending = requests.some((item) => item.status === 'pending');
  const instructions = data.paymentMethods.find((item) => item.id === method)?.instructions;
  async function refreshHistory() {
    setHistoryLoading(true);
    try {
      const [history, account] = await Promise.all([
        accountRequest<{ requests: PaymentRecord[] }>('/api/subscription'),
        accountRequest<AccountData>('/api/account'),
      ]);
      setRequests(history.requests);
      setData(account);
      if (account.plan !== data.plan) router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }
  useEffect(() => {
    setTheme(initial.profile.theme);
    void refreshHistory();
  }, []);
  async function save(kind: 'profile' | 'preferences') {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const body =
        kind === 'profile'
          ? {
              name,
              image,
              role: profile.role,
              country: profile.country,
              institution: profile.institution,
            }
          : {
              theme: profile.theme,
              default_model: allowedIds.includes(profile.default_model)
                ? profile.default_model
                : allowedIds[0],
              default_reasoning: profile.default_reasoning,
            };
      const saved = await accountRequest<AccountData>('/api/account', body, 'PUT');
      setData(saved);
      setProfile(saved.profile);
      setName(saved.user.name);
      setImage(saved.user.image);
      if (kind === 'preferences') setTheme(saved.profile.theme);
      await authClient.getSession({ query: { disableCookieCache: true } });
      setNotice(
        kind === 'profile'
          ? 'Profile saved.'
          : 'Preferences saved. They will apply the next time you open your workspace.'
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadPhoto(file?: File) {
    if (!file) return;
    setError('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError('Choose a JPG, PNG or WebP photo smaller than 5 MB.');
      return;
    }
    setPhotoLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const source = new window.Image();
      source.src = url;
      await source.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 192;
      const context = canvas.getContext('2d');
      if (!context) throw new Error();
      const edge = Math.min(source.width, source.height);
      context.drawImage(
        source,
        (source.width - edge) / 2,
        (source.height - edge) / 2,
        edge,
        edge,
        0,
        0,
        192,
        192
      );
      setImage(canvas.toDataURL('image/jpeg', 0.85));
    } catch {
      setError('This photo could not be opened. Try another image.');
    } finally {
      URL.revokeObjectURL(url);
      setPhotoLoading(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  }
  async function submitPayment() {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await accountRequest('/api/subscription', { method, reference });
      setReference('');
      await refreshHistory();
      setNotice('Request received. Your plan changes only after your payment has been verified.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword() {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const result = await authClient.changePassword({
        currentPassword: password,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error)
        throw new Error(
          'Check your current password. The new password must contain 8–128 characters.'
        );
      setPassword('');
      setNewPassword('');
      setNotice('Password changed. Your other sessions have been signed out.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteAccount() {
    if (deleteConfirmation !== 'DELETE') return;
    setBusy(true);
    setError('');
    try {
      const result = await authClient.deleteUser(
        data.hasPassword ? { password: deletePassword } : {}
      );
      if (result.error)
        throw new Error(
          data.hasPassword
            ? 'Check your password and try again.'
            : 'For your security, sign out and sign in with Google again, then return here to delete your account.'
        );
      localStorage.removeItem(`univa-chats-v2:${data.user.id}`);
      await pruneFiles(data.user.id, new Set()).catch(() => {});
      window.location.assign('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-surface min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 border-b px-4 py-4 sm:px-8">
        <Link href="/assistant" className="inline-flex min-h-11 items-center gap-2 text-sm">
          <ArrowLeft size={16} /> Back to workspace
        </Link>
        <ThemeToggle
          onThemeChange={async (theme) => {
            try {
              const saved = await accountRequest<AccountData>('/api/account', { theme }, 'PUT');
              setData(saved);
              setProfile((p) => ({ ...p, theme }));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs tracking-widest text-muted-foreground">UNUVIA ACCOUNT</p>
            <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your profile, workspace preferences and subscription.
            </p>
          </div>
          {data.isAdmin && (
            <Button variant="outline" asChild>
              <Link href="/admin/subscriptions">
                Manage subscriptions <ArrowUpRight size={16} />
              </Link>
            </Button>
          )}
        </div>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            setNotice('');
            setError('');
            window.history.replaceState(null, '', `/account?tab=${value}`);
          }}
        >
          <TabsList className="mb-6 grid h-auto w-full grid-cols-3 sm:w-fit">
            <TabsTrigger className="min-h-11 px-3" value="profile">
              <User />
              Profile
            </TabsTrigger>
            <TabsTrigger className="min-h-11 px-3" value="preferences">
              <Settings />
              Settings
            </TabsTrigger>
            <TabsTrigger className="min-h-11 px-3" value="subscription">
              <CreditCard />
              Plan
            </TabsTrigger>
          </TabsList>
          {notice && (
            <Alert className="mb-4">
              <Check size={16} />
              <AlertDescription role="status">{notice}</AlertDescription>
            </Alert>
          )}
          {error && !deleteOpen && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription role="alert">{error}</AlertDescription>
            </Alert>
          )}
          <TabsContent value="profile">
            <Card className="gap-6 p-5 sm:p-8">
              <div>
                <h2 className="text-xl font-semibold">Profile</h2>
                <p className="mt-1 text-sm text-muted-foreground">Make this workspace yours.</p>
              </div>
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save('profile');
                }}
              >
                <fieldset disabled={busy || photoLoading} className="space-y-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-semibold text-primary">
                      {image ? (
                        <img className="size-full object-cover" src={image} alt="Your profile" />
                      ) : (
                        name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => photoInput.current?.click()}
                      >
                        <Upload size={16} />
                        {photoLoading ? 'Opening…' : 'Change photo'}
                      </Button>
                      {image && (
                        <Button variant="ghost" type="button" onClick={() => setImage(null)}>
                          Remove
                        </Button>
                      )}
                    </div>
                    <Input
                      ref={photoInput}
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Profile photo"
                      onChange={(e) => void uploadPhoto(e.target.files?.[0])}
                    />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="profile-name">Full name</Label>
                      <Input
                        id="profile-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={100}
                        required
                        autoComplete="name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-email">Email</Label>
                      <Input id="profile-email" value={data.user.email} readOnly />
                      <p className="text-xs text-muted-foreground">Your sign-in email.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-role">Your role</Label>
                      <Select
                        value={profile.role}
                        onValueChange={(value) =>
                          setProfile((p) => ({ ...p, role: value as typeof p.role }))
                        }
                      >
                        <SelectTrigger id="profile-role" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-country">Country</Label>
                      <select
                        id="profile-country"
                        className={selectClass}
                        value={profile.country}
                        onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))}
                      >
                        <option value="">Choose your country</option>
                        {countries.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      {!profile.country && data.countrySuggestion && (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto px-0 text-xs"
                          onClick={() =>
                            setProfile((p) => ({ ...p, country: data.countrySuggestion }))
                          }
                        >
                          Use {displayNames.of(data.countrySuggestion)}
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Used to show your subscription price.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-institution">
                      University or institution{' '}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="profile-institution"
                      value={profile.institution}
                      onChange={(e) => setProfile((p) => ({ ...p, institution: e.target.value }))}
                      maxLength={120}
                      autoComplete="organization"
                      placeholder="Your institution"
                    />
                  </div>
                  <Button type="submit">
                    {busy && <Loader2 className="animate-spin" />}Save profile
                  </Button>
                </fieldset>
              </form>
            </Card>
          </TabsContent>
          <TabsContent value="preferences" className="space-y-6">
            <Card className="p-5 sm:p-8">
              <div>
                <h2 className="text-xl font-semibold">Workspace settings</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  These defaults are saved to your account.
                </p>
              </div>
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save('preferences');
                }}
              >
                <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="account-theme">Appearance</Label>
                    <select
                      id="account-theme"
                      className={selectClass}
                      value={profile.theme}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, theme: e.target.value as typeof p.theme }))
                      }
                    >
                      <option value="system">Follow system</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-model">Default model</Label>
                    <select
                      id="account-model"
                      className={selectClass}
                      disabled={!allowedModels.length}
                      value={
                        allowedIds.includes(profile.default_model)
                          ? profile.default_model
                          : allowedIds[0] || ''
                      }
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          default_model: e.target.value,
                          default_reasoning: null,
                        }))
                      }
                    >
                      {!allowedModels.length && <option value="">No connected models</option>}
                      {allowedModels.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!!Object.keys(reasoningLevelsFor(profile.default_model)).length && (
                    <div className="space-y-2">
                      <Label htmlFor="account-reasoning">Default reasoning</Label>
                      <select
                        id="account-reasoning"
                        className={selectClass}
                        value={profile.default_reasoning || ''}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            default_reasoning: (e.target.value ||
                              null) as typeof p.default_reasoning,
                          }))
                        }
                      >
                        <option value="">Model default</option>
                        {REASONING_LEVELS.filter(
                          (item) => item.id in reasoningLevelsFor(profile.default_model)
                        ).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={!allowedModels.length}>
                      Save settings
                    </Button>
                  </div>
                </fieldset>
              </form>
            </Card>
            {data.hasPassword && (
              <Card className="p-5 sm:p-8">
                <h2 className="text-xl font-semibold">Change password</h2>
                <form
                  className="space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void changePassword();
                  }}
                >
                  <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button variant="outline" type="submit">
                        Change password
                      </Button>
                    </div>
                  </fieldset>
                </form>
              </Card>
            )}
            <Card className="border-destructive/30 p-5 sm:p-8">
              <div>
                <h2 className="text-xl font-semibold">Delete account</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Permanently remove your account, profile and subscription records. Local
                  conversations and files on this device will also be cleared.
                </p>
              </div>
              <Button
                variant="destructive"
                className="w-fit"
                onClick={() => {
                  setError('');
                  setDeleteConfirmation('');
                  setDeletePassword('');
                  setDeleteOpen(true);
                }}
              >
                <Trash2 />
                Delete account
              </Button>
            </Card>
          </TabsContent>
          <TabsContent value="subscription" className="space-y-6">
            <Card className="p-5 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">
                    Your plan <Badge className="ml-2">{PLANS[data.plan].label}</Badge>
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {data.plan === 'pro' && data.subscription
                      ? `Active until ${displayDate(data.subscription.current_period_end)} (UTC).`
                      : data.subscription?.status === 'expired'
                        ? 'Your Pro period has ended. You are now on Free.'
                        : data.subscription?.status === 'cancelled'
                          ? 'Your Pro subscription was cancelled. You are now on Free.'
                          : 'Your personal workspace, with no subscription required.'}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  {PLANS[data.plan].requestsPerMinute} requests / minute
                </span>
              </div>
              <p className="text-sm">
                {data.plan === 'pro'
                  ? 'Access to all models supported by the connected service.'
                  : 'Claude Sonnet 4.6 Free is included.'}
              </p>
              <p className="text-xs text-muted-foreground">
                The connected service currently provides {allowedModels.length}{' '}
                {allowedModels.length === 1 ? 'model' : 'models'} for your account. Model
                availability can change independently of your UNUVIA plan.
              </p>
            </Card>
            <Card className="p-5 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    {data.plan === 'pro' ? 'Renew Pro' : 'Upgrade to Pro'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    30 days of access, activated after payment review.
                  </p>
                </div>
                <p className="text-2xl font-semibold">
                  {data.price.formatted}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ 30 days</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Your price follows your saved country.{' '}
                <Button variant="link" className="h-auto p-0" onClick={() => setTab('profile')}>
                  Update your profile
                </Button>
              </p>
              {!data.paymentMethods.length ? (
                <Alert>
                  <AlertDescription>
                    Payments are not available yet. Please contact support before sending any money.
                  </AlertDescription>
                </Alert>
              ) : pending ? (
                <Alert>
                  <AlertDescription>
                    Your payment request is awaiting review. You can follow its status below.
                  </AlertDescription>
                </Alert>
              ) : (
                <form
                  className="space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitPayment();
                  }}
                >
                  <fieldset disabled={busy || historyLoading} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="payment-method">Payment method</Label>
                      <select
                        id="payment-method"
                        className={selectClass}
                        value={method}
                        onChange={(e) => setMethod(e.target.value as typeof method)}
                      >
                        {data.paymentMethods.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <h3 className="mb-2 text-sm font-semibold">1. Make your payment</h3>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {instructions}
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Pay {data.price.formatted} using these instructions. Do not enter card
                        numbers or security codes here.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payment-reference">2. Enter your transaction reference</Label>
                      <Input
                        id="payment-reference"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        minLength={3}
                        maxLength={120}
                        required
                        placeholder="Reference from your payment receipt"
                      />
                      <p className="text-xs text-muted-foreground">
                        Submitting a reference does not charge you or activate Pro immediately.
                      </p>
                    </div>
                    <Button type="submit" disabled={busy || !reference.trim() || historyLoading}>
                      Submit for review
                    </Button>
                  </fieldset>
                </form>
              )}
            </Card>
            <Card className="p-5 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Payment history</h2>
                <Button
                  variant="ghost"
                  disabled={historyLoading}
                  onClick={() => void refreshHistory()}
                >
                  Refresh
                </Button>
              </div>
              {historyLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading your requests…
                </p>
              ) : !requests.length ? (
                <p className="text-sm text-muted-foreground">No payment requests yet.</p>
              ) : (
                <ul className="divide-y">
                  {requests.map((item) => (
                    <li key={item.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm">
                          {paymentAmount(item)} ·{' '}
                          {item.method === 'card' ? 'Card payment' : 'Mobile Money'}
                        </strong>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p className="break-all text-sm text-muted-foreground">
                        {item.reference} · {displayDate(item.created_at)}
                      </p>
                      {item.note && <p className="text-sm">Review note: {item.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setDeleteOpen(open);
            setError('');
          }
        }}
      >
        <DialogContent
          className="account-dialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelDelete.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently removes your UNUVIA account and its saved settings. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void deleteAccount();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                disabled={busy}
              />
            </div>
            {data.hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="delete-password">Current password</Label>
                <Input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                ref={cancelDelete}
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => setDeleteOpen(false)}
              >
                Keep account
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  busy || deleteConfirmation !== 'DELETE' || (data.hasPassword && !deletePassword)
                }
              >
                {busy ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
