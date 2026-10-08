import { driveFetch, driveToken, listUrl } from '@/lib/google-drive';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store' };

/** Lists the user's readable Drive files, newest first, optionally filtered by name. */
export async function GET(request: Request) {
  const drive = await driveToken(request.headers);
  if (!drive) return Response.json({ error: { code: 'sign_in_required' } }, { status: 401 });
  if (drive.status !== 'ok') return Response.json({ connected: false }, { headers: noStore });
  const search = new URL(request.url).searchParams.get('q') ?? '';
  const response = await driveFetch(drive.token, listUrl(search)).catch(() => null);
  if (response?.status === 401 || response?.status === 403)
    return Response.json({ connected: false }, { headers: noStore });
  if (!response?.ok)
    return Response.json({ error: { code: 'drive_unavailable' } }, { status: 502 });
  const data = (await response.json()) as {
    files?: { id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }[];
  };
  return Response.json({ connected: true, files: data.files ?? [] }, { headers: noStore });
}
