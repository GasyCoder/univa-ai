// Extracts plain text in the browser so the model only ever receives text.
// Libraries are loaded on demand; they are heavy and rarely needed.

export const DOCUMENT_ACCEPT =
  '.txt,.md,.csv,.pdf,.docx,.xlsx,.jpg,.jpeg,.png,text/plain,text/markdown,text/csv,application/pdf,image/jpeg,image/png';
export const DOCUMENT_HINT = '.txt, .md, .csv, .pdf, .docx, .xlsx, .jpg, or .png · up to 10 MB';
export const DOCUMENT_PATTERN = /\.(txt|md|csv|pdf|docx|xlsx|jpe?g|png)$/i;
export const MAX_FILE_BYTES = 10_000_000;
// Matches the server's per-message limit (route.ts), leaving room for the question.
export const MAX_TEXT_CHARS = 190_000;
const MAX_OCR_PAGES = 10; // ponytail: scanned PDFs read first 10 pages only, raise if needed
const OCR_LANGS = 'fra+eng';

const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

async function ocr(image: Blob | HTMLCanvasElement) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(OCR_LANGS);
  try {
    return (await worker.recognize(image)).data.text;
  } finally {
    await worker.terminate();
  }
}

export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  return pdfjs;
}

async function pdfText(file: File) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  if (text.trim().length > 20 * pdf.numPages) return text;
  // Little or no text layer: treat as a scan and run OCR on the first pages.
  let scanned = '';
  for (let i = 1; i <= Math.min(pdf.numPages, MAX_OCR_PAGES); i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    scanned += (await ocr(canvas)) + '\n';
  }
  return scanned;
}

export async function extractDocumentText(
  file: File
): Promise<{ text: string; truncated: boolean }> {
  const type = ext(file.name);
  let text: string;
  if (['txt', 'md', 'csv'].includes(type)) {
    text = await file.text();
    if (text.includes('\u0000')) throw new Error('This file contains binary data.');
  } else if (type === 'pdf') text = await pdfText(file);
  else if (type === 'docx') {
    const mammoth = await import('mammoth');
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (type === 'xlsx') {
    const { readXlsx, toCsv } = await import('./office');
    text = readXlsx(await file.arrayBuffer())
      .map((sheet) => `Sheet: ${sheet.name}\n${toCsv(sheet.rows)}`)
      .join('\n\n');
  } else if (['jpg', 'jpeg', 'png'].includes(type)) text = await ocr(file);
  else throw new Error('Choose a .txt, .md, .csv, .pdf, .docx, .xlsx, .jpg, or .png file.');

  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw new Error('No readable text was found in this file.');
  // Long documents are cut, not refused: the beginning is kept and the model is told.
  const truncated = text.length > MAX_TEXT_CHARS;
  if (truncated)
    text =
      text.slice(0, MAX_TEXT_CHARS) + '\n\n[Document truncated: only the beginning was included.]';
  return { text, truncated };
}
