'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  accountRequest,
  displayDate,
  paymentAmount,
  type PaymentRecord,
} from '@/lib/account-client';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ThemeToggle } from './theme-provider';
interface Subscription {
  user_id: string;
  name: string;
  email: string;
  status: string;
  current_period_end: string;
}
interface Event {
  id: string;
  action: string;
  note: string;
  created_at: string;
  email: string;
  admin_email: string | null;
}
interface AdminData {
  requests: PaymentRecord[];
  subscriptions: Subscription[];
  events: Event[];
}
interface Action {
  id: string;
  action: 'approve' | 'reject' | 'extend' | 'cancel';
  email: string;
}
const actionTitles = {
  approve: 'Approve payment?',
  reject: 'Reject payment?',
  extend: 'Extend Pro by 30 days?',
  cancel: 'Cancel Pro access?',
};
export function SubscriptionAdmin() {
  const [data, setData] = useState<AdminData>({ requests: [], subscriptions: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  async function refresh() {
    setLoading(true);
    try {
      setData(await accountRequest<AdminData>('/api/admin/subscriptions'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  function open(next: Action) {
    setAction(next);
    setNote('');
    setError('');
    setNotice('');
  }
  async function apply() {
    if (!action) return;
    setBusy(true);
    setError('');
    try {
      await accountRequest('/api/admin/subscriptions', {
        id: action.id,
        action: action.action,
        note,
      });
      setAction(null);
      setNotice('Subscription records updated.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pending = data.requests.filter((item) => item.status === 'pending');
  return (
    <main className="account-surface min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b px-4 py-4 sm:px-8">
        <Link href="/account" className="inline-flex min-h-11 items-center gap-2 text-sm">
          <ArrowLeft size={16} />
          Back to account
        </Link>
        <ThemeToggle
          onThemeChange={async (theme) => {
            try {
              await accountRequest('/api/account', { theme }, 'PUT');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs tracking-widest text-muted-foreground">
              UNUVIA ADMINISTRATION
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Subscriptions</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Verify payments before granting Pro access.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setError('');
              void refresh();
            }}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
            Refresh
          </Button>
        </div>
        {notice && (
          <Alert className="mb-5">
            <AlertDescription role="status">{notice}</AlertDescription>
          </Alert>
        )}
        {error && !action && (
          <Alert variant="destructive" className="mb-5">
            <AlertDescription role="alert">{error}</AlertDescription>
          </Alert>
        )}
        <Tabs defaultValue="requests">
          <TabsList className="mb-6 h-auto w-full sm:w-fit">
            <TabsTrigger value="requests" className="min-h-11">
              Requests ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="min-h-11">
              Access
            </TabsTrigger>
            <TabsTrigger value="events" className="min-h-11">
              Activity
            </TabsTrigger>
          </TabsList>
          <TabsContent value="requests">
            <div className="space-y-4">
              {loading && <p role="status">Loading records…</p>}
              {!loading && !data.requests.length && (
                <Card className="p-6 text-sm text-muted-foreground">No payment requests yet.</Card>
              )}
              {data.requests.map((item) => (
                <Card key={item.id} className="gap-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{item.name}</h2>
                      <p className="break-all text-sm text-muted-foreground">{item.email}</p>
                    </div>
                    <Badge variant={item.status === 'pending' ? 'default' : 'outline'}>
                      {item.status}
                    </Badge>
                  </div>
                  <dl className="grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Payment</dt>
                      <dd className="mt-1 font-medium">
                        {paymentAmount(item)} · {item.method === 'card' ? 'Card' : 'Mobile Money'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Reference</dt>
                      <dd className="mt-1 break-all font-mono">{item.reference}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Submitted</dt>
                      <dd className="mt-1">{displayDate(item.created_at)}</dd>
                    </div>
                  </dl>
                  {item.note && <p className="text-sm">Review note: {item.note}</p>}
                  {item.status === 'pending' && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={busy || loading}
                        onClick={() => open({ id: item.id, action: 'approve', email: item.email! })}
                      >
                        Approve payment
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || loading}
                        onClick={() => open({ id: item.id, action: 'reject', email: item.email! })}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="subscriptions">
            <div className="space-y-4">
              {!loading && !data.subscriptions.length && (
                <Card className="p-6 text-sm text-muted-foreground">No Pro subscriptions yet.</Card>
              )}
              {data.subscriptions.map((item) => {
                const expired =
                  item.status === 'active' && new Date(item.current_period_end) <= new Date();
                return (
                  <Card key={item.user_id} className="gap-4 p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">{item.name}</h2>
                        <p className="break-all text-sm text-muted-foreground">{item.email}</p>
                      </div>
                      <Badge variant="outline">{expired ? 'expired' : item.status}</Badge>
                    </div>
                    <p className="text-sm">
                      Period ends {displayDate(item.current_period_end)} (UTC).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={busy || loading}
                        onClick={() =>
                          open({ id: item.user_id, action: 'extend', email: item.email })
                        }
                      >
                        Extend by 30 days
                      </Button>
                      {item.status === 'active' && !expired && (
                        <Button
                          variant="outline"
                          disabled={busy || loading}
                          onClick={() =>
                            open({ id: item.user_id, action: 'cancel', email: item.email })
                          }
                        >
                          Cancel access
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="events">
            <Card className="p-5 sm:p-6">
              <h2 className="text-xl font-semibold">Subscription activity</h2>
              {!data.events.length ? (
                <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {data.events.map((item) => (
                    <li key={item.id} className="space-y-1 py-4">
                      <p className="break-all text-sm">
                        <strong>{item.action}</strong> · {item.email}
                      </p>
                      <p className="break-all text-xs text-muted-foreground">
                        {displayDate(item.created_at)} ·{' '}
                        {item.admin_email || 'Deleted administrator'}
                      </p>
                      {item.note && <p className="text-sm">{item.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setAction(null);
            setError('');
          }
        }}
      >
        <DialogContent
          className="account-dialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancel.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{action && actionTitles[action.action]}</DialogTitle>
            <DialogDescription>
              {action?.email}.{' '}
              {action?.action === 'approve'
                ? 'Confirm that the payment has been received. This grants or renews Pro for 30 days.'
                : action?.action === 'cancel'
                  ? 'This removes Pro access immediately. Free access remains.'
                  : action?.action === 'extend'
                    ? 'This adds 30 days without a new payment request. The change is recorded.'
                    : 'The user stays on their current plan and can submit a new payment reference.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void apply();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="review-note">
                {action?.action === 'reject' ? 'Reason for rejection' : 'Review note (optional)'}
              </Label>
              <Textarea
                id="review-note"
                maxLength={500}
                required={action?.action === 'reject'}
                value={note}
                disabled={busy}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                ref={cancel}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Go back
              </Button>
              <Button
                type="submit"
                variant={action?.action === 'cancel' ? 'destructive' : 'default'}
                disabled={busy || (action?.action === 'reject' && !note.trim())}
              >
                {busy ? 'Saving…' : 'Confirm'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
