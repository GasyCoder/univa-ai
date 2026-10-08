'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import {
  ArrowDownUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  Maximize,
  Search,
  WrapText,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadFile } from '@/lib/file-store';
import { parseCsv, readXlsx, type Sheet } from '@/lib/office';
import type { Artifact } from '@/lib/artifacts';

const BINARY = new Set(['pdf', 'docx', 'xlsx']);
const MAX_ROWS = 2000; // ponytail: plain table, virtualize if sheets this large become common

function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="viewer-toolbar" role="toolbar">
      {children}
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="viewer-toggle" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="viewer-message">{children}</p>;
}

function Loading({ label }: { label: string }) {
  return (
    <p className="viewer-message" role="status">
      <LoaderCircle className="animate-spin" size={18} /> {label}
    </p>
  );
}

/** Picks the viewer for a file and loads the original when it is a user attachment. */
export function ArtifactViewer({ artifact, userId }: { artifact: Artifact; userId: string }) {
  const fromStore = artifact.source === 'attachment';
  const [loaded, setLoaded] = useState<{ id: string; blob: Blob | null; text?: string } | null>(
    null
  );
  useEffect(() => {
    if (!fromStore) return;
    let live = true;
    setLoaded(null);
    loadFile(userId, artifact.id).then(async (blob) => {
      const text =
        blob && !BINARY.has(artifact.type) && artifact.type !== 'image'
          ? await blob.text().catch(() => undefined)
          : undefined;
      if (live) setLoaded({ id: artifact.id, blob, text });
    });
    return () => {
      live = false;
    };
  }, [fromStore, userId, artifact.id, artifact.type]);

  const svg = useMemo(
    () =>
      artifact.content && artifact.mimeType === 'image/svg+xml'
        ? new Blob([artifact.content], { type: 'image/svg+xml' })
        : null,
    [artifact.content, artifact.mimeType]
  );
  if (fromStore && loaded?.id !== artifact.id) return <Loading label="Opening file…" />;
  const blob = loaded?.blob ?? null;
  const text = loaded?.text ?? artifact.content;
  const missing =
    fromStore && !blob && (BINARY.has(artifact.type) || artifact.type === 'image') ? (
      <Message>The original file is not on this device. Showing the text sent to UNUVIA.</Message>
    ) : null;

  switch (artifact.type) {
    case 'pdf':
      if (blob) return <PdfViewer blob={blob} name={artifact.name} />;
      break;
    case 'docx':
      if (blob) return <DocxViewer blob={blob} name={artifact.name} />;
      break;
    case 'xlsx':
      if (blob) return <XlsxViewer blob={blob} />;
      break;
    case 'image':
      if (blob) return <ImageViewer blob={blob} name={artifact.name} />;
      if (svg) return <ImageViewer blob={svg} name={artifact.name} />;
      break;
  }
  if (text === undefined)
    return missing ?? <Message>This file can no longer be opened on this device.</Message>;
  const body = (() => {
    switch (missing ? 'text' : artifact.type) {
      case 'csv':
        return <SheetViewer sheets={[{ name: artifact.name, rows: parseCsv(text) }]} />;
      case 'markdown':
        return <MarkdownViewer text={text} />;
      case 'html':
        return <HtmlViewer text={text} name={artifact.name} />;
      case 'code':
        return <CodeViewer text={text} language={artifact.language} />;
      default:
        return <TextViewer text={text} />;
    }
  })();
  return (
    <>
      {missing}
      {body}
    </>
  );
}

function PdfViewer({ blob, name }: { blob: Blob; name: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [width, setWidth] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    let task: { destroy(): Promise<void> } | null = null;
    import('@/lib/extract-document')
      .then(({ loadPdfjs }) => loadPdfjs())
      .then(async (pdfjs) => {
        const loading = pdfjs.getDocument({ data: await blob.arrayBuffer() });
        task = loading;
        const loaded = await loading.promise;
        if (live) {
          setDoc(loaded);
          setPage(1);
        }
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
      void task?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !canvas.current || !width) return;
    let task: RenderTask | null = null;
    let live = true;
    doc.getPage(page).then((pdfPage) => {
      if (!live || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = zoom === 'fit' ? Math.max(0.2, (width - 32) / base.width) : zoom;
      const ratio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: scale * ratio });
      const el = canvas.current;
      el.width = viewport.width;
      el.height = viewport.height;
      el.style.width = `${viewport.width / ratio}px`;
      el.style.height = `${viewport.height / ratio}px`;
      task = pdfPage.render({ canvas: el, viewport });
      task.promise.catch(() => {});
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [doc, page, zoom, width]);

  const pages = doc?.numPages ?? 0;
  const current = zoom === 'fit' ? null : Math.round(zoom * 100);
  const step = (delta: number) =>
    setZoom((z) => Math.min(4, Math.max(0.25, (z === 'fit' ? 1 : z) + delta)));
  return (
    <div className="viewer viewer-pdf">
      <Toolbar>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="viewer-status" aria-live="polite">
          Page {pages ? page : '–'} of {pages || '–'}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight />
        </Button>
        <span className="viewer-spacer" />
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => step(-0.25)}>
          <ZoomOut />
        </Button>
        <span className="viewer-status">{current === null ? 'Fit' : `${current}%`}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => step(0.25)}>
          <ZoomIn />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit to width"
          aria-pressed={zoom === 'fit'}
          onClick={() => setZoom('fit')}
        >
          <Maximize />
        </Button>
      </Toolbar>
      <div className="viewer-canvas" ref={frame}>
        {error ? (
          <Message>This PDF could not be displayed.</Message>
        ) : (
          <>
            {!doc && <Loading label="Opening PDF…" />}
            <canvas ref={canvas} aria-label={`${name}, page ${page}`} role="img" />
          </>
        )}
      </div>
    </div>
  );
}

const PAGE_STYLE = `<style>
  body{font:15px/1.65 system-ui,sans-serif;color:#202835;background:#fff;max-width:780px;margin:0 auto;padding:32px 28px}
  img{max-width:100%;height:auto} table{border-collapse:collapse} td,th{border:1px solid #dce2ea;padding:4px 8px}
  @media (prefers-color-scheme:dark){body{color:#edf1f7;background:#1c242e} td,th{border-color:#34404f}}
</style>`;

function DocxViewer({ blob, name }: { blob: Blob; name: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setHtml(null);
    Promise.all([import('mammoth'), blob.arrayBuffer()])
      .then(([mammoth, arrayBuffer]) => mammoth.convertToHtml({ arrayBuffer }))
      .then((result) => live && setHtml(result.value))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [blob]);
  if (error) return <Message>This Word document could not be displayed.</Message>;
  if (html === null) return <Loading label="Opening document…" />;
  // An empty sandbox: the converted document runs no script and cannot reach this page.
  return (
    <iframe
      className="viewer-frame"
      title={name}
      sandbox=""
      srcDoc={`<!doctype html><meta charset="utf-8">${PAGE_STYLE}${html}`}
    />
  );
}

function XlsxViewer({ blob }: { blob: Blob }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    blob
      .arrayBuffer()
      .then((data) => live && setSheets(readXlsx(data)))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [blob]);
  if (error) return <Message>This spreadsheet could not be displayed.</Message>;
  if (!sheets) return <Loading label="Opening spreadsheet…" />;
  return <SheetViewer sheets={sheets} />;
}

const numeric = (value: string) => value.trim() !== '' && !Number.isNaN(Number(value));

function SheetViewer({ sheets }: { sheets: Sheet[] }) {
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);
  const sheet = sheets[index] ?? sheets[0];
  const [header = [], ...body] = sheet?.rows ?? [];
  const columns = Math.max(header.length, ...body.map((row) => row.length));
  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    let result = term
      ? body.filter((row) => row.some((cell) => cell.toLowerCase().includes(term)))
      : body;
    if (sort) {
      const { column, descending } = sort;
      result = [...result].sort((a, b) => {
        const x = a[column] ?? '';
        const y = b[column] ?? '';
        const order =
          numeric(x) && numeric(y)
            ? Number(x) - Number(y)
            : x.localeCompare(y, undefined, { numeric: true });
        return descending ? -order : order;
      });
    }
    return result;
  }, [body, query, sort]);

  if (!sheet || !sheet.rows.length) return <Message>This table is empty.</Message>;
  return (
    <div className="viewer viewer-sheet">
      <Toolbar>
        {sheets.length > 1 && (
          <div className="viewer-toggle" role="tablist" aria-label="Sheets">
            {sheets.map((item, i) => (
              <button
                key={`${item.name}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => {
                  setIndex(i);
                  setSort(null);
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        <label className="viewer-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search this table</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
          />
        </label>
        <span className="viewer-status">
          {rows.length.toLocaleString('en-US')} row{rows.length === 1 ? '' : 's'}
        </span>
      </Toolbar>
      <div className="viewer-table-wrap">
        <table className="viewer-table">
          <thead>
            <tr>
              {Array.from({ length: columns }, (_, c) => {
                const active = sort?.column === c;
                return (
                  <th
                    key={c}
                    scope="col"
                    aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort(
                          active && sort.descending ? null : { column: c, descending: active }
                        )
                      }
                    >
                      {header[c] || `Column ${c + 1}`}
                      <ArrowDownUp size={12} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).map((row, r) => (
              <tr key={r}>
                {Array.from({ length: columns }, (_, c) => (
                  <td key={c} data-numeric={numeric(row[c] ?? '') || undefined}>
                    {row[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > MAX_ROWS && (
          <Message>
            Showing the first {MAX_ROWS.toLocaleString('en-US')} rows. Search to find others.
          </Message>
        )}
      </div>
    </div>
  );
}

export function MarkdownViewer({ text }: { text: string }) {
  const [view, setView] = useState('Preview');
  return (
    <div className="viewer">
      <Toolbar>
        <Toggle label="View" options={['Preview', 'Source']} value={view} onChange={setView} />
      </Toolbar>
      {view === 'Preview' ? (
        <div className="viewer-document markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : (
        <CodeViewer text={text} language="markdown" bare />
      )}
    </div>
  );
}

function TextViewer({ text }: { text: string }) {
  const [wrap, setWrap] = useState(true);
  return (
    <div className="viewer">
      <Toolbar>
        <Button variant="ghost" size="sm" aria-pressed={wrap} onClick={() => setWrap((w) => !w)}>
          <WrapText /> Wrap lines
        </Button>
      </Toolbar>
      <pre className="viewer-text" data-wrap={wrap}>
        {text}
      </pre>
    </div>
  );
}

function HtmlViewer({ text, name }: { text: string; name: string }) {
  const [view, setView] = useState('Preview');
  return (
    <div className="viewer">
      <Toolbar>
        <Toggle label="View" options={['Preview', 'Source']} value={view} onChange={setView} />
      </Toolbar>
      {view === 'Preview' ? (
        // No allow-same-origin: the page's scripts cannot read UNUVIA's cookies or storage.
        <iframe
          className="viewer-frame"
          title={`Preview of ${name}`}
          sandbox="allow-scripts allow-forms allow-modals"
          srcDoc={text}
        />
      ) : (
        <CodeViewer text={text} language="html" bare />
      )}
    </div>
  );
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function CodeViewer({
  text,
  language,
  bare = false,
}: {
  text: string;
  language?: string;
  bare?: boolean;
}) {
  const [html, setHtml] = useState(() => escapeHtml(text));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    setHtml(escapeHtml(text));
    // highlight.js is loaded only when code is shown; unknown languages stay plain.
    import('highlight.js/lib/common').then(({ default: hljs }) => {
      if (!live) return;
      const lang = language && hljs.getLanguage(language) ? language : null;
      if (lang && text.length < 300_000)
        setHtml(hljs.highlight(text, { language: lang, ignoreIllegals: true }).value);
    });
    return () => {
      live = false;
    };
  }, [text, language]);
  const lines = text.split('\n').length;
  const code = (
    <div className="viewer-code">
      <pre className="viewer-gutter" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
      </pre>
      <pre className="viewer-source">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
  if (bare) return code;
  return (
    <div className="viewer">
      <Toolbar>
        <span className="viewer-status">{language || 'Plain text'}</span>
        <span className="viewer-spacer" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy code'}
        </Button>
      </Toolbar>
      {code}
    </div>
  );
}

function ImageViewer({ blob, name }: { blob: Blob; name: string }) {
  const [url, setUrl] = useState('');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [natural, setNatural] = useState(0);
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  const step = (delta: number) =>
    setZoom((z) => Math.min(5, Math.max(0.1, (z === 'fit' ? 1 : z) + delta)));
  return (
    <div className="viewer viewer-image">
      <Toolbar>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => step(-0.25)}>
          <ZoomOut />
        </Button>
        <span className="viewer-status">
          {zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => step(0.25)}>
          <ZoomIn />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={zoom === 'fit'}
          onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')}
        >
          {zoom === 'fit' ? 'Actual size' : 'Fit'}
        </Button>
      </Toolbar>
      <div className="viewer-canvas" data-fit={zoom === 'fit'}>
        {/* An <img> never runs an SVG's scripts. */}
        {url && (
          <img
            src={url}
            alt={name}
            onLoad={(e) => setNatural(e.currentTarget.naturalWidth)}
            style={
              zoom === 'fit' || !natural
                ? undefined
                : { width: `${natural * zoom}px`, maxWidth: 'none' }
            }
          />
        )}
      </div>
    </div>
  );
}
