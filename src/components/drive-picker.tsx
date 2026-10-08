'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Presentation,
  Search,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

type DriveFile = { id: string; name: string; mimeType: string; modifiedTime?: string };
type State =
  | { kind: 'loading' }
  | { kind: 'not_connected' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; files: DriveFile[] };

export function GoogleDriveMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" aria-hidden="true">
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
        fill="#ea4335"
      />
      <path
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.includes('spreadsheet') || mime === 'text/csv')
    return <FileSpreadsheet className="text-emerald-600" />;
  if (mime.includes('presentation')) return <Presentation className="text-amber-500" />;
  if (mime.startsWith('image/')) return <ImageIcon className="text-sky-600" />;
  return <FileText className={mime === 'application/pdf' ? 'text-red-500' : 'text-blue-600'} />;
}

const formatDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

/** Search the user's Google Drive and hand the chosen file back as a local File. */
export function DrivePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (file: File) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [picking, setPicking] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const request = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = ++request.current;
    setState((s) => (s.kind === 'ready' ? s : { kind: 'loading' }));
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/drive/files?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
        });
        const data = await response.json();
        if (id !== request.current) return;
        if (!response.ok) throw new Error();
        setState(data.connected ? { kind: 'ready', files: data.files } : { kind: 'not_connected' });
      } catch {
        if (id === request.current)
          setState({
            kind: 'error',
            message: 'Google Drive is unavailable. Try again in a moment.',
          });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);

  async function connect() {
    setConnecting(true);
    const result = await authClient
      .linkSocial({ provider: 'google', scopes: [DRIVE_SCOPE], callbackURL: '/assistant' })
      .catch(() => null);
    if (!result || result.error) {
      setConnecting(false);
      setState({
        kind: 'error',
        message: 'Google Drive could not be connected. Please try again.',
      });
    }
  }

  async function pick(file: DriveFile) {
    setPicking(file.id);
    try {
      const response = await fetch(`/api/drive/files/${encodeURIComponent(file.id)}`, {
        cache: 'no-store',
      });
      if (response.status === 403) return setState({ kind: 'not_connected' });
      if (!response.ok) {
        const code = (await response.json().catch(() => null))?.error?.code;
        throw new Error(
          code === 'file_too_large'
            ? 'This file exceeds 10 MB. Choose a smaller file.'
            : 'This file could not be opened from Google Drive.'
        );
      }
      const name = decodeURIComponent(response.headers.get('X-File-Name') ?? file.name);
      onOpenChange(false);
      await onPick(new File([await response.blob()], name));
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unable to open the file.',
      });
    } finally {
      setPicking(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="drive-picker"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchInput.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="drive-picker-title">
            <GoogleDriveMark size={22} /> Google Drive
          </DialogTitle>
          <DialogDescription>Choose a document to add to the chat.</DialogDescription>
        </DialogHeader>

        {state.kind === 'not_connected' ? (
          <div className="drive-picker-empty">
            <GoogleDriveMark size={40} />
            <strong>Connect your Google Drive</strong>
            <p>
              UNUVIA only reads the files you choose. You can disconnect at any time from your
              Google account.
            </p>
            <Button onClick={connect} disabled={connecting}>
              {connecting && <LoaderCircle className="animate-spin" />} Connect Google Drive
            </Button>
          </div>
        ) : (
          <>
            <label className="drive-picker-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search Google Drive</span>
              <Input
                ref={searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your Drive"
              />
            </label>
            <div className="drive-picker-list" aria-busy={state.kind === 'loading'}>
              {state.kind === 'loading' && (
                <p className="drive-picker-note">
                  <LoaderCircle className="animate-spin" size={16} /> Loading your files…
                </p>
              )}
              {state.kind === 'error' && (
                <p className="drive-picker-note" role="alert">
                  {state.message}
                </p>
              )}
              {state.kind === 'ready' && state.files.length === 0 && (
                <p className="drive-picker-note">
                  {query ? `No file matches “${query}”.` : 'No supported files in your Drive.'}
                </p>
              )}
              {state.kind === 'ready' &&
                state.files.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    className="drive-picker-item"
                    disabled={picking !== null}
                    onClick={() => void pick(file)}
                  >
                    <span className="drive-picker-icon">
                      {picking === file.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <FileIcon mime={file.mimeType} />
                      )}
                    </span>
                    <span className="drive-picker-name">{file.name}</span>
                    <span className="drive-picker-date">{formatDate(file.modifiedTime)}</span>
                  </button>
                ))}
            </div>
            <p className="drive-picker-hint">
              Docs, Sheets, Slides, PDF, Word, text and images · up to 10 MB
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
