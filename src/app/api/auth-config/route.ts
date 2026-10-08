import { googleEnabled } from '@/lib/auth';
export async function GET() {
  return Response.json({ googleEnabled }, { headers: { 'Cache-Control': 'no-store' } });
}
