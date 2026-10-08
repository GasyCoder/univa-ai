// Files shown in the side panel: user attachments and documents written in a response.
// A response document is a fenced block worth keeping (a page, a table, a document, a long
// program). Short snippets stay inline in the message.

export type ArtifactType =
  'pdf' | 'docx' | 'xlsx' | 'csv' | 'markdown' | 'code' | 'html' | 'image' | 'text';

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  mimeType: string;
  /** Text artifacts carry their content; binary files are loaded from the browser store. */
  content?: string;
  /** Code language, for highlighting. */
  language?: string;
  size?: number;
  createdAt: number;
  downloadable: boolean;
  /** Still being written by the model. */
  generating?: boolean;
  source: 'attachment' | 'response';
  /** Prepared for revisions of the same file; every artifact is version 1 today. */
  version: number;
  parentArtifactId?: string;
  metadata?: Record<string, string | number>;
}

export const TYPE_LABELS: Record<ArtifactType, string> = {
  pdf: 'PDF',
  docx: 'Word document',
  xlsx: 'Spreadsheet',
  csv: 'CSV table',
  markdown: 'Markdown',
  code: 'Code',
  html: 'Web page',
  image: 'Image',
  text: 'Text',
};

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  json: 'application/json',
};

// Fence language → file extension, for names and downloads.
const EXTENSIONS: Record<string, string> = {
  markdown: 'md',
  md: 'md',
  html: 'html',
  htm: 'html',
  svg: 'svg',
  csv: 'csv',
  tsv: 'tsv',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  python: 'py',
  py: 'py',
  json: 'json',
  css: 'css',
  sql: 'sql',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'cs',
  cs: 'cs',
  php: 'php',
  ruby: 'rb',
  go: 'go',
  rust: 'rs',
  kotlin: 'kt',
  swift: 'swift',
  r: 'r',
  yaml: 'yml',
  yml: 'yml',
  xml: 'xml',
  latex: 'tex',
  tex: 'tex',
  text: 'txt',
  txt: 'txt',
  plaintext: 'txt',
};

export const extension = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

/** Type of a file from its name. */
export function typeOfName(name: string): ArtifactType {
  const ext = extension(name);
  if (ext === 'pdf' || ext === 'docx' || ext === 'xlsx' || ext === 'html') return ext;
  if (ext === 'htm') return 'html';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (ext === 'txt' || !ext) return 'text';
  return 'code';
}

export const mimeOfName = (name: string) => MIME[extension(name)] ?? 'text/plain';

const languageOfName = (name: string) =>
  Object.entries(EXTENSIONS).find(([, ext]) => ext === extension(name))?.[0];

export function attachmentArtifact(file: {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}): Artifact {
  const type = typeOfName(file.name);
  return {
    id: file.id,
    name: file.name,
    type,
    mimeType: file.mimeType || mimeOfName(file.name),
    language: type === 'code' ? languageOfName(file.name) : undefined,
    size: file.size,
    createdAt: Date.now(),
    downloadable: true,
    source: 'attachment',
    version: 1,
  };
}

/** A text artifact rebuilt from the text sent to the model, when the original is gone. */
export function documentTextArtifact(id: string, name: string, content: string): Artifact | null {
  const text = content.match(/<document>\n([\s\S]*?)\n<\/document>/)?.[1];
  if (!text) return null;
  const type = typeOfName(name);
  const textual = type === 'markdown' || type === 'csv' || type === 'code' || type === 'text';
  const base = name.replace(/\.[^.]+$/, '');
  const shown = textual ? name : `${base} (text).txt`;
  return {
    id,
    name: shown,
    type: textual ? type : 'text',
    mimeType: mimeOfName(shown),
    language: textual && type === 'code' ? languageOfName(name) : undefined,
    content: text,
    createdAt: Date.now(),
    downloadable: true,
    source: 'attachment',
    version: 1,
    metadata: textual ? {} : { note: 'Extracted text — the original file is not on this device.' },
  };
}

const MIN_CODE_LINES = 15;

export type Segment = { kind: 'text'; text: string } | { kind: 'artifact'; artifact: Artifact };

function slug(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || ''
  );
}

function nameFor(info: string, lang: string, body: string, index: number) {
  const titled = info.match(/(?:title|file(?:name)?)=["']?([^"'\s]+)/i)?.[1];
  const bare = info
    .split(/\s+/)
    .slice(1)
    .find((token) => /^[\w.-]+\.[a-z0-9]+$/i.test(token));
  const given = titled ?? bare;
  if (given) return given.replace(/[\\/]/g, '');
  const ext = EXTENSIONS[lang] ?? 'txt';
  const heading =
    lang === 'html' || lang === 'htm'
      ? body.match(/<title>([^<]+)<\/title>/i)?.[1] || body.match(/<h1[^>]*>([^<]+)</i)?.[1]
      : lang === 'markdown' || lang === 'md'
        ? body.match(/^#{1,2}\s+(.+)$/m)?.[1]
        : undefined;
  const base =
    (heading && slug(heading)) ||
    (ext === 'html'
      ? 'page'
      : ext === 'csv' || ext === 'tsv'
        ? 'table'
        : ext === 'md'
          ? 'document'
          : 'code');
  return `${base}${index ? `-${index + 1}` : ''}.${ext}`;
}

/**
 * Splits a response into Markdown text and files. `key` makes ids stable across renders, so a
 * file can be reopened. An unclosed block at the end is a file still being written.
 */
export function splitResponse(content: string, key: string, streaming = false): Segment[] {
  const segments: Segment[] = [];
  const fence = /^(`{3,}|~{3,})([^\n]*)\n/gm;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(content))) {
    const [opening, marks, info] = match;
    const start = match.index;
    const bodyStart = start + opening.length;
    const close = new RegExp(`^${marks[0]}{${marks.length},}[ \\t]*$`, 'm');
    const rest = content.slice(bodyStart);
    const closing = close.exec(rest);
    const body = closing ? rest.slice(0, closing.index).replace(/\n$/, '') : rest;
    const end = closing ? bodyStart + closing.index + closing[0].length : content.length;
    fence.lastIndex = end;
    const lang = info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const type: ArtifactType | null =
      lang === 'html' || lang === 'htm'
        ? 'html'
        : lang === 'svg'
          ? 'image'
          : lang === 'csv' || lang === 'tsv'
            ? 'csv'
            : lang === 'markdown' || lang === 'md'
              ? 'markdown'
              : body.split('\n').length >= MIN_CODE_LINES ||
                  /\b(?:title|file(?:name)?)=/i.test(info)
                ? lang && !['text', 'txt', 'plaintext'].includes(lang)
                  ? 'code'
                  : 'text'
                : null;
    if (!type) continue;
    const name = nameFor(info, lang, body, index);
    if (start > cursor) segments.push({ kind: 'text', text: content.slice(cursor, start) });
    segments.push({
      kind: 'artifact',
      artifact: {
        id: `${key}:${index}`,
        name,
        type,
        mimeType: mimeOfName(name),
        language: type === 'code' ? lang : undefined,
        content: body,
        size: new Blob([body]).size,
        createdAt: Date.now(),
        downloadable: true,
        generating: streaming && !closing,
        source: 'response',
        version: 1,
      },
    });
    cursor = end;
    index++;
  }
  if (cursor < content.length) segments.push({ kind: 'text', text: content.slice(cursor) });
  return segments;
}

export const responseArtifacts = (content: string, key: string) =>
  splitResponse(content, key).flatMap((s) => (s.kind === 'artifact' ? [s.artifact] : []));

export function formatSize(bytes?: number) {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Types that can be shown in a new tab without running the file's own code in our origin. */
export const opensInTab = (type: ArtifactType) => type !== 'docx' && type !== 'xlsx';

/**
 * Opens a file in a new tab. A blob URL has this site's origin, so a web page or SVG would run
 * its scripts with access to the user's session: those are wrapped in a sandboxed frame.
 */
export function openInTab(artifact: Artifact, blob: Blob) {
  let shown = blob;
  if (artifact.type === 'html' || artifact.mimeType === 'image/svg+xml') {
    const page = (inner: string) =>
      new Blob(
        [
          `<!doctype html><meta charset="utf-8"><title>${escapeAttribute(artifact.name)}</title>` +
            `<style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style>${inner}`,
        ],
        { type: 'text/html' }
      );
    return blob.text().then((text) => {
      const srcdoc =
        artifact.type === 'html'
          ? text
          : `<body style="margin:0;display:grid;place-items:center">${text}</body>`;
      const url = URL.createObjectURL(
        page(
          `<iframe sandbox="${artifact.type === 'html' ? 'allow-scripts allow-forms allow-modals' : ''}" srcdoc="${escapeAttribute(srcdoc)}"></iframe>`
        )
      );
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }
  if (!['pdf', 'image'].includes(artifact.type))
    shown = new Blob([blob], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(shown);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return Promise.resolve();
}
