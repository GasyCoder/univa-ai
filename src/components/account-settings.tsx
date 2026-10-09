'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ArrowLeft,
  ArrowUpRight,
  CreditCard,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  Sun,
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
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader } from './ui/card';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { Spinner } from './ui/spinner';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Badge } from './ui/badge';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
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
    // The delete dialog shows its own error next to the field it concerns.
    if (error && !deleteOpen) toast.error(error, { id: 'account-error' });
    else toast.dismiss('account-error');
  }, [error, deleteOpen]);
  useEffect(() => {
    setTheme(initial.profile.theme);
    void refreshHistory();
  }, []);
  async function save(kind: 'profile' | 'preferences') {
    setBusy(true);
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
      toast.success(
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
    setError('');
    try {
      await accountRequest('/api/subscription', { method, reference });
      setReference('');
      await refreshHistory();
      toast.success(
        'Request received. Your plan changes only after your payment has been verified.'
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword() {
    setBusy(true);
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
      toast.success('Password changed. Your other sessions have been signed out.');
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
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-b px-4 py-4 sm:px-8">
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
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground">
              UNUVIA ACCOUNT
            </p>
            <h1 className="type-page-title">Your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your profile, workspace preferences and subscription.
            </p>
          </div>
          {data.isAdmin && (
            <Button className="min-h-11" variant="outline" asChild>
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
            setError('');
            window.history.replaceState(null, '', `/account?tab=${value}`);
          }}
          className="gap-6"
        >
          <TabsList className="grid w-full grid-cols-3 group-data-[orientation=horizontal]/tabs:h-auto sm:w-fit">
            <TabsTrigger className="min-h-11 px-4" value="profile">
              <User />
              Profile
            </TabsTrigger>
            <TabsTrigger className="min-h-11 px-4" value="preferences">
              <Settings />
              Settings
            </TabsTrigger>
            <TabsTrigger className="min-h-11 px-4" value="subscription">
              <CreditCard />
              Plan
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <h2 className="type-card-title">Profile</h2>
                <CardDescription>Make this workspace yours.</CardDescription>
              </CardHeader>
              <form
                className="flex flex-col gap-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save('profile');
                }}
              >
                <CardContent>
                  <fieldset disabled={busy || photoLoading} className="grid gap-6">
                    <div className="flex flex-wrap items-center gap-4">
                      <Avatar className="size-16 text-xl">
                        <AvatarImage src={image || undefined} alt="Your profile" />
                        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="grid gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="min-h-11"
                            variant="outline"
                            type="button"
                            onClick={() => photoInput.current?.click()}
                          >
                            {photoLoading ? <Spinner /> : <Upload />}
                            {photoLoading ? 'Opening…' : 'Change photo'}
                          </Button>
                          {image && (
                            <Button
                              className="min-h-11"
                              variant="ghost"
                              type="button"
                              onClick={() => setImage(null)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          JPG, PNG or WebP, up to 5 MB.
                        </p>
                      </div>
                      <Input
                        ref={photoInput}
                        className="hidden"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="Profile photo"
                        onChange={(e) => void uploadPhoto(e.target.files?.[0])}
                      />
                    </div>
                    <Separator />
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="grid content-start gap-2">
                        <Label htmlFor="profile-name">Full name</Label>
                        <Input
                          className="h-11"
                          id="profile-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={100}
                          required
                          autoComplete="name"
                        />
                      </div>
                      <div className="grid content-start gap-2">
                        <Label htmlFor="profile-email">Email</Label>
                        <Input
                          className="h-11"
                          id="profile-email"
                          value={data.user.email}
                          readOnly
                        />
                        <p className="text-xs text-muted-foreground">Your sign-in email.</p>
                      </div>
                      <div className="grid content-start gap-2">
                        <Label htmlFor="profile-role">Your role</Label>
                        <Select
                          value={profile.role}
                          onValueChange={(value) =>
                            setProfile((p) => ({ ...p, role: value as typeof p.role }))
                          }
                        >
                          <SelectTrigger
                            id="profile-role"
                            className="w-full data-[size=default]:h-11"
                          >
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
                      <div className="grid content-start gap-2">
                        <Label htmlFor="profile-country">Country</Label>
                        <NativeSelect
                          id="profile-country"
                          className="h-11 w-full"
                          value={profile.country}
                          onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))}
                        >
                          <NativeSelectOption value="">Choose your country</NativeSelectOption>
                          {countries.map((item) => (
                            <NativeSelectOption key={item.code} value={item.code}>
                              {item.label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                        <p className="text-xs text-muted-foreground">
                          Used to show your subscription price.
                          {!profile.country && data.countrySuggestion && (
                            <Button
                              type="button"
                              variant="link"
                              className="ml-1 h-auto p-0 text-xs"
                              onClick={() =>
                                setProfile((p) => ({ ...p, country: data.countrySuggestion }))
                              }
                            >
                              Use {displayNames.of(data.countrySuggestion)}
                            </Button>
                          )}
                        </p>
                      </div>
                      <div className="grid content-start gap-2 sm:col-span-2">
                        <Label htmlFor="profile-institution">
                          University or institution{' '}
                          <span className="font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          className="h-11"
                          id="profile-institution"
                          value={profile.institution}
                          onChange={(e) =>
                            setProfile((p) => ({ ...p, institution: e.target.value }))
                          }
                          maxLength={120}
                          autoComplete="organization"
                          placeholder="Your institution"
                        />
                      </div>
                    </div>
                  </fieldset>
                </CardContent>
                <CardFooter className="border-t">
                  <Button className="min-h-11" type="submit" disabled={busy || photoLoading}>
                    {busy && <Spinner />}Save profile
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>
          <TabsContent value="preferences" className="grid gap-6">
            <Card>
              <CardHeader>
                <h2 className="type-card-title">Workspace settings</h2>
                <CardDescription>
                  Defaults for your workspace, saved to your account.
                </CardDescription>
              </CardHeader>
              <form
                className="flex flex-col gap-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save('preferences');
                }}
              >
                <CardContent>
                  <fieldset disabled={busy} className="grid gap-6 sm:grid-cols-2">
                    <div className="grid content-start gap-2 sm:col-span-2">
                      <Label id="account-theme-label">Appearance</Label>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        aria-labelledby="account-theme-label"
                        className="w-full sm:w-fit"
                        value={profile.theme}
                        onValueChange={(value) =>
                          value && setProfile((p) => ({ ...p, theme: value as typeof p.theme }))
                        }
                      >
                        <ToggleGroupItem className="min-h-11 flex-1 px-4" value="light">
                          <Sun />
                          Light
                        </ToggleGroupItem>
                        <ToggleGroupItem className="min-h-11 flex-1 px-4" value="dark">
                          <Moon />
                          Dark
                        </ToggleGroupItem>
                        <ToggleGroupItem className="min-h-11 flex-1 px-4" value="system">
                          <Monitor />
                          System
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                    <div className="grid content-start gap-2">
                      <Label htmlFor="account-model">Default model</Label>
                      <Select
                        disabled={!allowedModels.length}
                        value={
                          allowedIds.includes(profile.default_model)
                            ? profile.default_model
                            : allowedIds[0] || ''
                        }
                        onValueChange={(value) =>
                          setProfile((p) => ({
                            ...p,
                            default_model: value,
                            default_reasoning: null,
                          }))
                        }
                      >
                        <SelectTrigger
                          id="account-model"
                          className="w-full data-[size=default]:h-11"
                        >
                          <SelectValue placeholder="No models available" />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedModels.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {MODELS.find((item) => item.id === profile.default_model)?.description}
                        {data.plan === 'free' && ' Pro includes every Claude model.'}
                      </p>
                    </div>
                    {!!Object.keys(reasoningLevelsFor(profile.default_model)).length && (
                      <div className="grid content-start gap-2">
                        <Label htmlFor="account-reasoning">Default reasoning</Label>
                        <Select
                          value={profile.default_reasoning || 'default'}
                          onValueChange={(value) =>
                            setProfile((p) => ({
                              ...p,
                              default_reasoning: (value === 'default'
                                ? null
                                : value) as typeof p.default_reasoning,
                            }))
                          }
                        >
                          <SelectTrigger
                            id="account-reasoning"
                            className="w-full data-[size=default]:h-11"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Model default</SelectItem>
                            {REASONING_LEVELS.filter(
                              (item) => item.id in reasoningLevelsFor(profile.default_model)
                            ).map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {REASONING_LEVELS.find((item) => item.id === profile.default_reasoning)
                            ?.description ?? 'Let the model decide how long to think.'}
                        </p>
                      </div>
                    )}
                  </fieldset>
                </CardContent>
                <CardFooter className="border-t">
                  <Button
                    className="min-h-11"
                    type="submit"
                    disabled={busy || !allowedModels.length}
                  >
                    {busy && <Spinner />}Save settings
                  </Button>
                </CardFooter>
              </form>
            </Card>
            {data.hasPassword && (
              <Card>
                <CardHeader>
                  <h2 className="type-card-title">Change password</h2>
                  <CardDescription>
                    Changing your password signs out your other sessions.
                  </CardDescription>
                </CardHeader>
                <form
                  className="flex flex-col gap-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void changePassword();
                  }}
                >
                  <CardContent>
                    <fieldset disabled={busy} className="grid gap-6 sm:grid-cols-2">
                      <div className="grid content-start gap-2">
                        <Label htmlFor="current-password">Current password</Label>
                        <Input
                          className="h-11"
                          id="current-password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <div className="grid content-start gap-2">
                        <Label htmlFor="new-password">New password</Label>
                        <Input
                          className="h-11"
                          id="new-password"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">8 to 128 characters.</p>
                      </div>
                    </fieldset>
                  </CardContent>
                  <CardFooter className="border-t">
                    <Button className="min-h-11" variant="outline" type="submit" disabled={busy}>
                      Change password
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            )}
            <Card className="border-destructive/30">
              <CardHeader>
                <h2 className="type-card-title">Delete account</h2>
                <CardDescription>
                  Permanently remove your account, profile and subscription records. Local
                  conversations and files on this device will also be cleared.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  variant="destructive"
                  className="min-h-11"
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
              </CardFooter>
            </Card>
          </TabsContent>
          <TabsContent value="subscription" className="grid gap-6">
            <Card>
              <CardHeader>
                <h2 className="type-card-title">
                  Your plan <Badge className="ml-2 align-middle">{PLANS[data.plan].label}</Badge>
                </h2>
                <CardDescription>
                  {data.plan === 'pro' && data.subscription
                    ? `Active until ${displayDate(data.subscription.current_period_end)} (UTC).`
                    : data.subscription?.status === 'expired'
                      ? 'Your Pro period has ended. You are now on Free.'
                      : data.subscription?.status === 'cancelled'
                        ? 'Your Pro subscription was cancelled. You are now on Free.'
                        : 'Your personal workspace, with no subscription required.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span id="usage-label" className="font-medium">
                      {data.usage.days === 1 ? 'Daily' : `${data.usage.days}-day`} usage allowance
                    </span>
                    <span className="text-muted-foreground">{data.usage.percent}% used</span>
                  </div>
                  <Progress value={data.usage.percent} aria-labelledby="usage-label" />
                  <p className="text-xs text-muted-foreground">
                    Larger models and long documents use the allowance faster. It frees up again
                    over time.
                  </p>
                </div>
                <Separator />
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div className="grid gap-1">
                    <dt className="text-muted-foreground">Models</dt>
                    <dd>
                      {allowedModels.map((item) => item.label).join(', ') || 'None available'}
                    </dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-muted-foreground">Rate</dt>
                    <dd>{PLANS[data.plan].requestsPerMinute} requests per minute</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="type-card-title">
                  {data.plan === 'pro' ? 'Renew Pro' : 'Upgrade to Pro'}
                </h2>
                <CardDescription>
                  30 days of access to every Claude model, activated after payment review. Your
                  price follows your saved country.{' '}
                  <Button variant="link" className="h-auto p-0" onClick={() => setTab('profile')}>
                    Update your profile
                  </Button>
                </CardDescription>
                <CardAction className="text-2xl font-semibold">
                  {data.price.formatted}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ 30 days</span>
                </CardAction>
              </CardHeader>
              {!data.paymentMethods.length ? (
                <CardContent>
                  <Alert>
                    <AlertDescription>
                      Payments are not available yet. Please contact support before sending any
                      money.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              ) : pending ? (
                <CardContent>
                  <Alert>
                    <AlertDescription>
                      Your payment request is awaiting review. You can follow its status below.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              ) : (
                <form
                  className="flex flex-col gap-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitPayment();
                  }}
                >
                  <CardContent>
                    <fieldset disabled={busy || historyLoading} className="grid gap-6">
                      <div className="grid gap-2">
                        <Label htmlFor="payment-method">Payment method</Label>
                        <Select
                          value={method}
                          onValueChange={(value) => setMethod(value as typeof method)}
                        >
                          <SelectTrigger
                            id="payment-method"
                            className="w-full data-[size=default]:h-11 sm:w-72"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {data.paymentMethods.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                      <div className="grid gap-2">
                        <Label htmlFor="payment-reference">
                          2. Enter your transaction reference
                        </Label>
                        <Input
                          className="h-11"
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
                    </fieldset>
                  </CardContent>
                  <CardFooter className="border-t">
                    <Button
                      className="min-h-11"
                      type="submit"
                      disabled={busy || !reference.trim() || historyLoading}
                    >
                      {busy && <Spinner />}Submit for review
                    </Button>
                  </CardFooter>
                </form>
              )}
            </Card>
            <Card>
              <CardHeader>
                <h2 className="type-card-title">Payment history</h2>
                <CardDescription>Your requests and their review status.</CardDescription>
                <CardAction>
                  <Button
                    className="min-h-11"
                    variant="ghost"
                    disabled={historyLoading}
                    onClick={() => void refreshHistory()}
                  >
                    {historyLoading ? <Spinner /> : <RefreshCw />}
                    Refresh
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div role="status" aria-label="Loading your requests" className="grid gap-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-5 w-1/2" />
                  </div>
                ) : !requests.length ? (
                  <p className="text-sm text-muted-foreground">No payment requests yet.</p>
                ) : (
                  <ul className="divide-y">
                    {requests.map((item) => (
                      <li key={item.id} className="grid gap-2 py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm">
                            {paymentAmount(item)} ·{' '}
                            {item.method === 'card' ? 'Card payment' : 'Mobile Money'}
                          </strong>
                          <Badge
                            variant={
                              item.status === 'approved'
                                ? 'default'
                                : item.status === 'rejected'
                                  ? 'destructive'
                                  : 'outline'
                            }
                          >
                            {item.status}
                          </Badge>
                        </div>
                        <p className="break-all text-sm text-muted-foreground">
                          {item.reference} · {displayDate(item.created_at)}
                        </p>
                        {item.note && <p className="text-sm">Review note: {item.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
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
          className="account-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto"
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
                className="h-11"
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
                  className="h-11"
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
                className="min-h-11"
                ref={cancelDelete}
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => setDeleteOpen(false)}
              >
                Keep account
              </Button>
              <Button
                className="min-h-11"
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
