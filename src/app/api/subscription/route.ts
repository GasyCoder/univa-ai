import { apiFailure, createPayment, jsonBody, requireAccount } from '@/lib/account';
import { getAuthDatabase } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireAccount(request);
    const db = await getAuthDatabase();
    return Response.json(
      {
        requests: (
          await db.query(
            'SELECT id,amount,currency,method,reference,status,created_at,reviewed_at,note FROM payment_request WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
            [user.id]
          )
        ).rows,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireAccount(request, true);
    const body = await jsonBody(request);
    return Response.json(await createPayment(user.id, body.method, body.reference), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
