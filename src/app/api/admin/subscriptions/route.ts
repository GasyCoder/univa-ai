import {
  AccountError,
  apiFailure,
  changeSubscription,
  isAdmin,
  jsonBody,
  requireAccount,
  reviewPayment,
} from '@/lib/account';
import { getAuthDatabase } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    if (!isAdmin(await requireAccount(request))) throw new AccountError('not_found', 404);
    const db = await getAuthDatabase();
    const requests = await db.query(
      `SELECT p.*,u.name,u.email FROM payment_request p JOIN "user" u ON u.id=p.user_id ORDER BY (p.status='pending') DESC,p.created_at DESC LIMIT 200`
    );
    const subscriptions = await db.query(
      `SELECT s.*,u.name,u.email FROM subscription s JOIN "user" u ON u.id=s.user_id ORDER BY s.updated_at DESC LIMIT 200`
    );
    const events = await db.query(
      `SELECT e.id,e.action,e.note,e.created_at,u.email,a.email AS admin_email FROM subscription_event e JOIN "user" u ON u.id=e.user_id LEFT JOIN "user" a ON a.id=e.actor_id ORDER BY e.created_at DESC LIMIT 100`
    );
    return Response.json(
      { requests: requests.rows, subscriptions: subscriptions.rows, events: events.rows },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireAccount(request, true);
    if (!isAdmin(user)) throw new AccountError('not_found', 404);
    const body = await jsonBody(request);
    if (
      !['approve', 'reject', 'extend', 'cancel'].includes(body.action as string) ||
      typeof body.id !== 'string' ||
      !body.id ||
      body.id.length > 100 ||
      typeof body.note !== 'string' ||
      body.note.trim().length > 500
    )
      throw new AccountError('invalid_request', 422);
    if (body.action === 'reject' && !body.note.trim())
      throw new AccountError('note_required', 422, 'note');
    if (body.action === 'approve' || body.action === 'reject')
      await reviewPayment(user.id, body.id, body.action, body.note.trim());
    else
      await changeSubscription(
        user.id,
        body.id,
        body.action as 'extend' | 'cancel',
        body.note.trim()
      );
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiFailure(error);
  }
}
