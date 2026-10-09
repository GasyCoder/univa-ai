import { getAuth } from '@/lib/auth';
import { logFailure } from '@/lib/log';
export const runtime = 'nodejs';
async function handler(request: Request) {
  try {
    return await (await getAuth()).handler(request);
  } catch (error) {
    logFailure('auth', error);
    return Response.json(
      { error: { code: 'database_unavailable' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
export { handler as GET, handler as POST };
