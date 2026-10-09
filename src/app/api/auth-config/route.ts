import { googleEnabled } from '@/lib/auth';
import { mailEnabled } from '@/lib/mail';
export const runtime = 'nodejs';
export async function GET() {
  return Response.json(
    { googleEnabled, mailEnabled },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
