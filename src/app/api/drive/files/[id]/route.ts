import {
  DOWNLOADS,
  DRIVE_MAX_BYTES,
  EXPORTS,
  driveFetch,
  driveToken,
  exportUrl,
  fileUrl,
} from '@/lib/google-drive';

export const runtime = 'nodejs';
const fail = (code: string, status: number) =>
  Response.json({ error: { code } }, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Returns one Drive file as bytes the browser can read like a local upload:
 * Google Docs/Slides as text, Sheets as CSV, everything else as the original file.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{10,200}$/.test(id)) return fail('invalid_request', 400);
  const drive = await driveToken(request.headers);
  if (!drive) return fail('sign_in_required', 401);
  if (drive.status !== 'ok') return fail('drive_not_connected', 403);

  const meta = await driveFetch(drive.token, fileUrl(id, { fields: 'name,mimeType,size' })).catch(
    () => null
  );
  if (!meta?.ok) return fail(meta?.status === 404 ? 'not_found' : 'drive_unavailable', 502);
  const { name, mimeType, size } = (await meta.json()) as {
    name: string;
    mimeType: string;
    size?: string;
  };
  const exported = EXPORTS[mimeType];
  const ext = exported?.ext ?? DOWNLOADS[mimeType];
  if (!ext) return fail('unsupported_type', 415);
  if (Number(size || 0) > DRIVE_MAX_BYTES) return fail('file_too_large', 413);

  const content = await driveFetch(
    drive.token,
    exported ? exportUrl(id, exported.mime) : fileUrl(id, { alt: 'media' })
  ).catch(() => null);
  // Google refuses to export files over 10 MB with 403.
  if (!content?.ok)
    return fail(content?.status === 403 ? 'file_too_large' : 'drive_unavailable', 502);
  const bytes = await content.arrayBuffer();
  if (bytes.byteLength > DRIVE_MAX_BYTES) return fail('file_too_large', 413);
  const fileName = name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(fileName),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
