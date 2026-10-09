'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Code2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Expand,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  type Artifact,
  type ArtifactType,
  TYPE_LABELS,
  formatSize,
  openInTab,
  opensInTab,
  saveBlob,
} from '@/lib/artifacts';
import { loadFile } from '@/lib/file-store';
import type { PanelMode } from '@/lib/use-artifact-panel';
import { ArtifactViewer } from './artifact-viewers';

const ICONS: Record<ArtifactType, typeof FileText> = {
  pdf: FileText,
  docx: FileText,
  markdown: FileText,
  text: FileText,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  code: Code2,
  html: Globe,
  image: ImageIcon,
};

function ArtifactIcon({ type }: { type: ArtifactType }) {
  const Icon = ICONS[type];
  return (
    <span className="artifact-icon" data-type={type} aria-hidden="true">
      <Icon size={18} />
    </span>
  );
}

/** A file in the conversation. Opens the side panel. */
export function ArtifactCard({
  artifact,
  active,
  onOpen,
}: {
  artifact: Artifact;
  active: boolean;
  onOpen: (artifact: Artifact) => void;
}) {
  return (
    <Button
      variant="outline"
      type="button"
      className="artifact-card h-auto justify-start whitespace-normal p-3 data-[active]:bg-accent"
      data-active={active || undefined}
      aria-label={`Open ${artifact.name}`}
      aria-pressed={active}
      onClick={() => onOpen(artifact)}
    >
      <ArtifactIcon type={artifact.type} />
      <span className="artifact-card-copy">
        <strong>{artifact.name}</strong>
        <span>
          {artifact.generating ? (
            <>
              <LoaderCircle className="animate-spin" size={12} /> Writing…
            </>
          ) : (
            [TYPE_LABELS[artifact.type], formatSize(artifact.size)].filter(Boolean).join(' · ')
          )}
        </span>
      </span>
    </Button>
  );
}

async function blobOf(artifact: Artifact, userId: string) {
  if (artifact.source === 'attachment') {
    const stored = await loadFile(userId, artifact.id);
    if (stored) return stored;
    // The extracted text is not the original of a binary file.
    if (['pdf', 'docx', 'xlsx', 'image'].includes(artifact.type)) return null;
  }
  return artifact.content === undefined
    ? null
    : new Blob([artifact.content], { type: `${artifact.mimeType};charset=utf-8` });
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

/** Prints the rendered document; the browser's dialog saves it as a PDF. */
async function printMarkdown(name: string, markdown: string) {
  const [{ renderToStaticMarkup }, { default: ReactMarkdown }, { default: remarkGfm }] =
    await Promise.all([import('react-dom/server'), import('react-markdown'), import('remark-gfm')]);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  // react-markdown drops raw HTML, so this markup carries no script.
  frame.srcdoc =
    `<!doctype html><meta charset="utf-8"><title>${baseName(name).replace(/</g, '')}</title>` +
    '<style>body{font:12pt/1.6 Georgia,serif;margin:2cm;color:#111}h1,h2,h3{font-family:system-ui,sans-serif}' +
    'pre{white-space:pre-wrap;background:#f4f4f4;padding:8pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:3pt 6pt}</style>' +
    renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>);
  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.append(frame);
}

interface PanelProps {
  artifact: Artifact;
  userId: string;
  mode: PanelMode;
  onClose: () => void;
  onMaximize: () => void;
  onFullscreen: () => void;
  onRestore: () => void;
}

export function ArtifactPanel({
  artifact,
  userId,
  mode,
  onClose,
  onMaximize,
  onFullscreen,
  onRestore,
}: PanelProps) {
  const [notice, setNotice] = useState('');
  const panel = useRef<HTMLElement>(null);
  useEffect(() => setNotice(''), [artifact.id]);

  async function withBlob(action: (blob: Blob) => unknown) {
    setNotice('');
    try {
      const blob = await blobOf(artifact, userId);
      if (!blob) throw new Error('missing');
      await action(blob);
    } catch {
      setNotice('This file is no longer available on this device.');
    }
  }
  // Extra formats are built in the browser from the text of the file.
  const formats: { label: string; run: () => unknown }[] = [
    {
      label: `Original (${artifact.name})`,
      run: () => withBlob((b) => saveBlob(b, artifact.name)),
    },
  ];
  const text = artifact.content;
  if (text !== undefined && (artifact.type === 'markdown' || artifact.type === 'text')) {
    formats.push({
      label: 'Word document (.docx)',
      run: async () =>
        saveBlob((await import('@/lib/office')).writeDocx(text), `${baseName(artifact.name)}.docx`),
    });
    if (artifact.type === 'markdown')
      formats.push({ label: 'PDF (print dialog)', run: () => printMarkdown(artifact.name, text) });
  }
  if (text !== undefined && artifact.type === 'csv')
    formats.push({
      label: 'Excel workbook (.xlsx)',
      run: async () => {
        const { parseCsv, writeXlsx } = await import('@/lib/office');
        saveBlob(writeXlsx(parseCsv(text)), `${baseName(artifact.name)}.xlsx`);
      },
    });

  const large = mode !== 'normal';
  return (
    <aside
      ref={panel}
      className="artifact-panel"
      data-mode={mode}
      aria-label={`File: ${artifact.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && large && !e.defaultPrevented) onRestore();
      }}
    >
      <header className="artifact-header">
        <Button
          variant="ghost"
          size="sm"
          className="artifact-back"
          onClick={onClose}
          aria-label="Back to chat"
        >
          <ArrowLeft /> Back
        </Button>
        <ArtifactIcon type={artifact.type} />
        <div className="artifact-title">
          <strong title={artifact.name}>{artifact.name}</strong>
          <span>
            {artifact.generating
              ? 'Writing…'
              : [TYPE_LABELS[artifact.type], formatSize(artifact.size)].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="artifact-actions">
          {artifact.downloadable &&
            (formats.length > 1 ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Download" title="Download">
                    <Download />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {formats.map((format) => (
                    <DropdownMenuItem key={format.label} onSelect={() => void format.run()}>
                      {format.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Download"
                title="Download"
                onClick={() => void formats[0].run()}
              >
                <Download />
              </Button>
            ))}
          {opensInTab(artifact.type) && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open in a new tab"
              title="Open in a new tab"
              onClick={() => void withBlob((b) => openInTab(artifact, b))}
            >
              <ExternalLink />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="artifact-desktop-only"
            aria-label={mode === 'maximized' ? 'Restore panel' : 'Maximize panel'}
            title={mode === 'maximized' ? 'Restore' : 'Maximize'}
            onClick={mode === 'maximized' ? onRestore : onMaximize}
          >
            {mode === 'maximized' ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="artifact-desktop-only"
            aria-label={mode === 'fullscreen' ? 'Exit full screen' : 'Full screen'}
            title={mode === 'fullscreen' ? 'Exit full screen' : 'Full screen'}
            onClick={mode === 'fullscreen' ? onRestore : onFullscreen}
          >
            {mode === 'fullscreen' ? <Minimize2 /> : <Expand />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="artifact-close"
            aria-label="Close file panel"
            title="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </header>
      {notice && (
        <p className="viewer-message" role="alert">
          {notice}
        </p>
      )}
      {artifact.metadata?.note && <p className="viewer-message">{artifact.metadata.note}</p>}
      <div className="artifact-body">
        <ArtifactViewer artifact={artifact} userId={userId} />
      </div>
    </aside>
  );
}
