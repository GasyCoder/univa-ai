import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAuth, getAuthDatabase } from './auth';
import { transaction } from './db';
import { PLANS, proPrice, suggestedCountry, type PlanId, type Profile } from './plans';
import { getClaudeModelIds } from './claude';
import { usageCost, type TokenUsage } from './chat-models';

export function isAdmin(user: { email: string; emailVerified: boolean }) {
  return (
    user.emailVerified &&
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .some((email) => email.trim().toLowerCase() === user.email.toLowerCase())
  );
}
export async function profileFor(userId: string): Promise<Profile> {
  const db = await getAuthDatabase();
  await db.query('INSERT INTO profile (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
  return (
    await db.query(
      'SELECT role, institution, country, theme, default_model, default_reasoning FROM profile WHERE user_id=$1',
      [userId]
    )
  ).rows[0];
}
export async function subscriptionFor(userId: string) {
  const db = await getAuthDatabase();
  const subscription =
    (
      await db.query(
        "SELECT status, current_period_end FROM subscription WHERE user_id=$1 AND plan='pro'",
        [userId]
      )
    ).rows[0] || null;
  const plan: PlanId =
    subscription?.status === 'active' && new Date(subscription.current_period_end) > new Date()
      ? 'pro'
      : 'free';
  return {
    plan,
    subscription: subscription
      ? {
          ...subscription,
          status:
            subscription.status === 'active' && plan === 'free' ? 'expired' : subscription.status,
        }
      : null,
  };
}
/** Claude API cost used over the plan's rolling window, against its allowance. */
export async function usageFor(userId: string, plan: PlanId) {
  const { days, microUsd } = PLANS[plan].allowance;
  const db = await getAuthDatabase();
  const used = Number(
    (
      await db.query(
        'SELECT COALESCE(SUM(cost_micro_usd),0) AS used FROM assistant_usage WHERE user_id=$1 AND day > CURRENT_DATE - $2::int',
        [userId, days]
      )
    ).rows[0].used
  );
  return { percent: Math.min(100, Math.floor((used / microUsd) * 100)), days };
}
export async function recordUsage(userId: string, model: string, usage: TokenUsage) {
  const db = await getAuthDatabase();
  await db.query(
    `INSERT INTO assistant_usage (user_id,day,model,requests,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_micro_usd)
    VALUES ($1,CURRENT_DATE,$2,1,$3,$4,$5,$6,$7)
    ON CONFLICT(user_id,day,model) DO UPDATE SET requests=assistant_usage.requests+1,
      input_tokens=assistant_usage.input_tokens+excluded.input_tokens,
      output_tokens=assistant_usage.output_tokens+excluded.output_tokens,
      cache_read_tokens=assistant_usage.cache_read_tokens+excluded.cache_read_tokens,
      cache_write_tokens=assistant_usage.cache_write_tokens+excluded.cache_write_tokens,
      cost_micro_usd=assistant_usage.cost_micro_usd+excluded.cost_micro_usd`,
    [
      userId,
      model,
      usage.input,
      usage.output,
      usage.cacheRead,
      usage.cacheWrite,
      usageCost(model, usage),
    ]
  );
}
export function configuredPayments() {
  return [
    {
      id: 'mobile_money' as const,
      label: 'Mobile Money',
      instructions: process.env.PAYMENT_MOBILE_MONEY_INSTRUCTIONS?.trim() || '',
    },
    {
      id: 'card' as const,
      label: 'Card payment',
      instructions: process.env.PAYMENT_CARD_INSTRUCTIONS?.trim() || '',
    },
  ].filter((method) => method.instructions);
}
export function accountPrice(country: string) {
  return proPrice(country, Number(process.env.PRO_PRICE_MGA));
}
export async function accountData(
  user: { id: string; name: string; email: string; emailVerified: boolean; image?: string | null },
  language: string | null
) {
  const db = await getAuthDatabase();
  const profile = await profileFor(user.id);
  const { plan, subscription } = await subscriptionFor(user.id);
  const hasPassword =
    (
      await db.query('SELECT 1 FROM account WHERE "userId"=$1 AND "providerId"=\'credential\'', [
        user.id,
      ])
    ).rowCount !== 0;
  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image || null },
    profile,
    plan,
    subscription,
    isAdmin: isAdmin(user),
    hasPassword,
    providerModelIds: await getClaudeModelIds(),
    usage: await usageFor(user.id, plan),
    paymentMethods: configuredPayments(),
    price: accountPrice(profile.country),
    countrySuggestion: suggestedCountry(language),
  };
}
export class AccountError extends Error {
  constructor(
    public code: string,
    public status = 422,
    public field?: string
  ) {
    super(code);
  }
}
export function apiFailure(error: unknown) {
  const known = error instanceof AccountError;
  return Response.json(
    {
      error: {
        code: known ? error.code : 'database_unavailable',
        ...(known && error.field ? { field: error.field } : {}),
      },
    },
    { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
export async function requireAccount(request: Request, write = false) {
  if (
    write &&
    request.headers.get('origin') !==
      new URL(process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4200').origin
  )
    throw new AccountError('invalid_origin', 403);
  const session = await (await getAuth()).api.getSession({ headers: request.headers });
  if (!session) throw new AccountError('sign_in_required', 401);
  return session.user;
}
export async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new AccountError('invalid_request', 400);
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError('invalid_request', 400);
  let bytes = 0;
  let text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 400000) {
        await reader.cancel();
        throw new AccountError('invalid_request', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new AccountError('invalid_request', 400);
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError('invalid_request', 400);
  } finally {
    reader.releaseLock();
  }
}
export async function createPayment(userId: string, method: unknown, reference: unknown) {
  if (!configuredPayments().some((item) => item.id === method))
    throw new AccountError('payment_not_configured', 422, 'method');
  if (
    typeof reference !== 'string' ||
    reference.trim().length < 3 ||
    reference.trim().length > 120 ||
    /[\x00-\x1f]/.test(reference)
  )
    throw new AccountError('invalid_reference', 422, 'reference');
  const profile = await profileFor(userId);
  const price = accountPrice(profile.country);
  return transaction(async (client) => {
    await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [userId]);
    if (
      (
        await client.query("SELECT 1 FROM payment_request WHERE user_id=$1 AND status='pending'", [
          userId,
        ])
      ).rowCount
    )
      throw new AccountError('request_pending', 422, 'reference');
    if (
      (
        await client.query(
          'SELECT 1 FROM payment_request WHERE method=$1 AND lower(reference)=lower($2)',
          [method, reference.trim()]
        )
      ).rowCount
    )
      throw new AccountError('reference_used', 422, 'reference');
    try {
      return (
        await client.query(
          'INSERT INTO payment_request (id,user_id,amount,currency,method,reference) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          [randomUUID(), userId, price.amount, price.currency, method, reference.trim()]
        )
      ).rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new AccountError('request_conflict', 422, 'reference');
      throw error;
    }
  });
}
export async function reviewPayment(
  adminId: string,
  id: string,
  decision: 'approve' | 'reject',
  note: string
) {
  return transaction(async (client) => {
    const payment = (
      await client.query('SELECT * FROM payment_request WHERE id=$1 FOR UPDATE', [id])
    ).rows[0];
    if (!payment) throw new AccountError('not_found', 404);
    if (payment.status !== 'pending') throw new AccountError('already_reviewed', 409);
    // Serialize all payment and subscription changes for the same account.
    await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [payment.user_id]);
    if (decision === 'approve') {
      await client.query(
        `INSERT INTO subscription (user_id,plan,status,current_period_end) VALUES ($1,'pro','active',NOW()+INTERVAL '30 days')
        ON CONFLICT(user_id) DO UPDATE SET plan='pro',status='active',current_period_end=GREATEST(CASE WHEN subscription.status='active' THEN subscription.current_period_end ELSE NOW() END,NOW())+INTERVAL '30 days',updated_at=NOW()`,
        [payment.user_id]
      );
      await client.query(
        "INSERT INTO subscription_event (id,user_id,actor_id,action,note) VALUES ($1,$2,$3,'approve',$4)",
        [randomUUID(), payment.user_id, adminId, note]
      );
    }
    await client.query(
      'UPDATE payment_request SET status=$2,reviewed_by=$3,reviewed_at=NOW(),note=$4 WHERE id=$1',
      [id, decision === 'approve' ? 'approved' : 'rejected', adminId, note]
    );
  });
}
export async function changeSubscription(
  adminId: string,
  userId: string,
  action: 'extend' | 'cancel',
  note: string
) {
  return transaction(async (client) => {
    if (!(await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [userId])).rowCount)
      throw new AccountError('not_found', 404);
    const subscription = (
      await client.query('SELECT * FROM subscription WHERE user_id=$1 FOR UPDATE', [userId])
    ).rows[0];
    if (!subscription) throw new AccountError('not_found', 404);
    if (action === 'cancel')
      await client.query(
        "UPDATE subscription SET status='cancelled',updated_at=NOW() WHERE user_id=$1",
        [userId]
      );
    else
      await client.query(
        `UPDATE subscription SET status='active',current_period_end=GREATEST(CASE WHEN status='active' THEN current_period_end ELSE NOW() END,NOW())+INTERVAL '30 days',updated_at=NOW() WHERE user_id=$1`,
        [userId]
      );
    await client.query(
      'INSERT INTO subscription_event (id,user_id,actor_id,action,note) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), userId, adminId, action, note]
    );
  });
}
export async function assistantAccess(userId: string, providerIds: string[] | null) {
  const { plan } = await subscriptionFor(userId);
  const allowed = PLANS[plan].modelIds;
  return {
    plan,
    modelIds: providerIds === null ? allowed : allowed.filter((id) => providerIds.includes(id)),
  };
}
