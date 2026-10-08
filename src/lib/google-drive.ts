import 'server-only';
import { getAuth } from './auth';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const DRIVE_MAX_BYTES = 10_000_000;
const API = 'https://www.googleapis.com/drive/v3/files';

// Google-native files are exported as text; the rest is downloaded and read in the browser.
export const EXPORTS: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'text/plain', ext: 'txt' },
  'application/vnd.google-apps.presentation': { mime: 'text/plain', ext: 'txt' },
  'application/vnd.google-apps.spreadsheet': { mime: 'text/csv', ext: 'csv' },
};
export const DOWNLOADS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export type DriveToken = { status: 'ok'; token: string } | { status: 'not_connected' };

/** The Drive access token of the signed-in user, refreshed by Better Auth when needed. */
export async function driveToken(headers: Headers): Promise<DriveToken | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const accounts = await auth.api.listUserAccounts({ headers });
  const google = accounts.find((a) => a.providerId === 'google' && a.scopes.includes(DRIVE_SCOPE));
  if (!google) return { status: 'not_connected' };
  try {
    const { accessToken } = await auth.api.getAccessToken({
      body: { accountId: google.id },
      headers,
    });
    return accessToken ? { status: 'ok', token: accessToken } : { status: 'not_connected' };
  } catch {
    return { status: 'not_connected' }; // revoked or expired without refresh token: reconnect
  }
}

export function driveFetch(token: string, url: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
}

export function listUrl(search: string) {
  const types = [...Object.keys(EXPORTS), ...Object.keys(DOWNLOADS)]
    .map((t) => `mimeType='${t}'`)
    .join(' or ');
  let q = `trashed=false and (${types})`;
  const term = search.trim().slice(0, 100).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  if (term) q += ` and name contains '${term}'`;
  const params = new URLSearchParams({
    q,
    pageSize: '30',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  return `${API}?${params}`;
}

export const fileUrl = (id: string, query: Record<string, string>) =>
  `${API}/${encodeURIComponent(id)}?${new URLSearchParams({ supportsAllDrives: 'true', ...query })}`;
export const exportUrl = (id: string, mime: string) =>
  `${API}/${encodeURIComponent(id)}/export?${new URLSearchParams({ mimeType: mime })}`;
