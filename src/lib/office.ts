// Minimal Office Open XML and CSV handling with fflate (already a dependency), instead of a
// full spreadsheet library. Reads cell values only: formulas show their last computed value.
// ponytail: no formats, merged cells or dates (shown as serial numbers); use SheetJS if needed.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface Sheet {
  name: string;
  rows: string[][];
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const sep =
    delimiter ??
    ((text.split('\n')[0].match(/\t/g)?.length ?? 0) >
    (text.split('\n')[0].match(/[,;]/g)?.length ?? 0)
      ? '\t'
      : (text.split('\n')[0].match(/;/g)?.length ?? 0) >
          (text.split('\n')[0].match(/,/g)?.length ?? 0)
        ? ';'
        : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === sep) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

export const toCsv = (rows: string[][]) =>
  rows
    .map((row) => row.map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');

const columnIndex = (ref: string) =>
  [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

const parseXml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');
const textOf = (node: Element | null | undefined) =>
  node ? [...node.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('') : '';

export function readXlsx(data: ArrayBuffer): Sheet[] {
  const files = unzipSync(new Uint8Array(data));
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  const shared = [...parseXml(read('xl/sharedStrings.xml')).getElementsByTagName('si')].map(textOf);
  const relations = new Map(
    [...parseXml(read('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')].map(
      (r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? ''] as const
    )
  );
  return [...parseXml(read('xl/workbook.xml')).getElementsByTagName('sheet')].map((sheet) => {
    const target = relations.get(sheet.getAttribute('r:id')) ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const rows: string[][] = [];
    for (const row of parseXml(read(path)).getElementsByTagName('row')) {
      const values: string[] = [];
      for (const cell of row.getElementsByTagName('c')) {
        const type = cell.getAttribute('t');
        const raw = cell.getElementsByTagName('v')[0]?.textContent ?? '';
        values[columnIndex(cell.getAttribute('r') ?? '')] =
          type === 's'
            ? (shared[Number(raw)] ?? '')
            : type === 'inlineStr'
              ? textOf(cell.getElementsByTagName('is')[0])
              : type === 'b'
                ? raw === '1'
                  ? 'TRUE'
                  : 'FALSE'
                : raw;
      }
      rows.push(Array.from(values, (v) => v ?? ''));
    }
    return { name: sheet.getAttribute('name') ?? 'Sheet', rows };
  });
}

const xml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML 1.0 cannot carry.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const columnName = (index: number) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PACKAGE_RELS = (target: string) =>
  `${DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/></Relationships>`;

export function writeXlsx(rows: string[][], sheetName = 'Sheet1'): Blob {
  const sheet = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((value, c) => {
            const ref = `${columnName(c)}${r + 1}`;
            return /^-?(0|[1-9]\d*)(\.\d+)?$/.test(value) && value.length < 16
              ? `<c r="${ref}"><v>${value}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
          })
          .join('')}</row>`
    )
    .join('');
  const zip = zipSync({
    '[Content_Types].xml': strToU8(
      `${DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
    ),
    '_rels/.rels': strToU8(PACKAGE_RELS('xl/workbook.xml')),
    'xl/workbook.xml': strToU8(
      `${DECLARATION}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `${DECLARATION}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`
    ),
  });
  return new Blob([zip], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** A plain Word document from Markdown: headings, paragraphs, lists and bold text. */
export function writeDocx(markdown: string): Blob {
  const runs = (text: string, base = '') =>
    text
      .split(/(\*\*[^*]+\*\*)/)
      .filter(Boolean)
      .map((part) => {
        const bold = /^\*\*[^*]+\*\*$/.test(part);
        const clean = (bold ? part.slice(2, -2) : part)
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2');
        const props = base + (bold ? '<w:b/>' : '');
        return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(clean)}</w:t></w:r>`;
      })
      .join('');
  const SIZES = ['', '36', '30', '26', '24', '24', '24'];
  let inCode = false;
  const paragraphs = markdown.split('\n').flatMap((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode;
      return [];
    }
    if (inCode)
      return `<w:p><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`;
    if (!line.trim() || /^\s*([-*_])\1{2,}\s*$/.test(line)) return [];
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading)
      return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>${runs(heading[2], `<w:b/><w:sz w:val="${SIZES[heading[1].length]}"/>`)}</w:p>`;
    const item = line.match(/^(\s*)(?:[-*+]|(\d+)[.)])\s+(.*)$/);
    if (item)
      return `<w:p><w:pPr><w:ind w:left="${360 + item[1].length * 180}" w:hanging="360"/></w:pPr>${runs(`${item[2] ? `${item[2]}.` : '•'}\t${item[3]}`)}</w:p>`;
    if (/^\s*\|/.test(line)) {
      if (/^\s*\|?\s*:?-{2,}/.test(line)) return [];
      return `<w:p>${runs(
        line
          .replace(/^\s*\||\|\s*$/g, '')
          .split('|')
          .map((c) => c.trim())
          .join('\t')
      )}</w:p>`;
    }
    return `<w:p>${runs(line.replace(/^>\s?/, ''))}</w:p>`;
  });
  const zip = zipSync({
    '[Content_Types].xml': strToU8(
      `${DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    ),
    '_rels/.rels': strToU8(PACKAGE_RELS('word/document.xml')),
    'word/document.xml': strToU8(
      `${DECLARATION}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr/></w:body></w:document>`
    ),
  });
  return new Blob([zip], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
