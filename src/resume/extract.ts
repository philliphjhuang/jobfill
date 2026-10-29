/**
 * Turns a resume file (PDF, DOCX or plain text) into text lines plus the
 * hyperlink targets it contains. Runs entirely in the extension page; the
 * file never leaves the browser.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface ExtractedText {
  lines: string[];
  /** Hyperlink targets (PDF link annotations, DOCX relationships). */
  links: string[];
}

export type ResumeFileKind = 'pdf' | 'docx' | 'txt';

export function resumeKind(name: string, type = ''): ResumeFileKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (
    ext === 'docx' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (ext === 'txt' || ext === 'md' || type.startsWith('text/')) return 'txt';
  return null;
}

export async function extractText(bytes: Uint8Array, kind: ResumeFileKind): Promise<ExtractedText> {
  if (kind === 'pdf') return extractPdf(bytes);
  if (kind === 'docx') return extractDocx(bytes);
  return textToExtract(new TextDecoder().decode(bytes));
}

export function textToExtract(text: string): ExtractedText {
  return { lines: text.split(/\r?\n/), links: [] };
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Rebuild visual lines from positioned text runs: group by baseline, sort
 * left-to-right, and mark wide horizontal gaps (right-aligned dates, column
 * layouts) with a tab so the parser can treat them as separators.
 */
export function itemsToLines(items: readonly PdfTextItem[]): string[] {
  const rows: Array<{ y: number; h: number; items: PdfTextItem[] }> = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = item.transform[5] ?? 0;
    const h = Math.abs(item.height || item.transform[3] || 10);
    const row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, 0.4 * Math.min(h, r.h)));
    if (row) row.items.push(item);
    else rows.push({ y, h, items: [item] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    const sorted = [...row.items].sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));
    let out = '';
    let prevEnd: number | null = null;
    for (const it of sorted) {
      const x = it.transform[4] ?? 0;
      if (prevEnd !== null) {
        const gap = x - prevEnd;
        if (gap > row.h * 1.5) out += '\t';
        else if (gap > row.h * 0.12 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
      }
      out += it.str;
      prevEnd = x + it.width;
    }
    return out.replace(/ {2,}/g, ' ').trim();
  });
}

function workerUrl(): string {
  const runtime = (globalThis as { chrome?: typeof chrome }).chrome?.runtime;
  return runtime?.getURL ? runtime.getURL('pdf.worker.min.mjs') : 'pdf.worker.min.mjs';
}

export async function extractPdf(bytes: Uint8Array): Promise<ExtractedText> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl();
  const doc: PDFDocumentProxy = await pdfjs.getDocument({
    // pdf.js transfers (detaches) the buffer it is given to its worker; hand it a
    // copy so the caller's bytes stay intact (e.g. to save the resume file).
    data: bytes.slice(),
    // The extension CSP forbids eval, and a resume is untrusted input.
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const lines: string[] = [];
  const links: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const textItems = content.items.filter((i) => 'str' in i) as unknown as PdfTextItem[];
      lines.push(...itemsToLines(textItems));
      for (const annot of await page.getAnnotations()) {
        if (annot.subtype === 'Link' && typeof annot.url === 'string') links.push(annot.url);
      }
    }
  } finally {
    await doc.destroy();
  }
  return { lines, links };
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

interface ZipEntry {
  method: number;
  data: Uint8Array;
}

/** Minimal ZIP reader (central directory based) — enough for .docx files. */
export function readZip(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This file is not a valid .docx document.');
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compressed = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const local = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    entries.set(name, { method, data: bytes.subarray(start, start + compressed) });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const reader = source
    .pipeThrough(
      new DecompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>,
    )
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function entryText(entries: Map<string, ZipEntry>, name: string): Promise<string> {
  const entry = entries.get(name);
  if (!entry) return '';
  if (entry.method === 0) return new TextDecoder().decode(entry.data);
  if (entry.method === 8) return new TextDecoder().decode(await inflateRaw(entry.data));
  throw new Error(`Unsupported compression in ${name}.`);
}

export async function extractDocx(bytes: Uint8Array): Promise<ExtractedText> {
  const entries = readZip(bytes);
  const documentXml = await entryText(entries, 'word/document.xml');
  if (!documentXml) throw new Error('This file is not a valid .docx document.');
  const relsXml = await entryText(entries, 'word/_rels/document.xml.rels');
  return docxXmlToText(documentXml, relsXml);
}

const localName = (el: Element): string => el.localName || el.nodeName.replace(/^.*:/, '');

/** Paragraphs become lines, table rows become tab-separated lines, hyperlinks are collected. */
export function docxXmlToText(documentXml: string, relsXml = ''): ExtractedText {
  const parser = new DOMParser();
  const targets = new Map<string, string>();
  if (relsXml) {
    const rels = parser.parseFromString(relsXml, 'application/xml');
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target && /hyperlink/i.test(rel.getAttribute('Type') ?? ''))
        targets.set(id, target);
    }
  }
  const doc = parser.parseFromString(documentXml, 'application/xml');
  const lines: string[] = [];
  const links: string[] = [];

  const paragraphText = (p: Element): string => {
    let text = '';
    const walk = (node: Element): void => {
      for (const child of Array.from(node.children)) {
        const name = localName(child);
        if (name === 't') text += child.textContent ?? '';
        else if (name === 'tab') text += '\t';
        else if (name === 'br' || name === 'cr') text += '\n';
        else if (name === 'numPr' && !text) text = '• ';
        else {
          if (name === 'hyperlink') {
            const id = child.getAttribute('r:id') ?? child.getAttributeNS('*', 'id');
            const target = id ? targets.get(id) : undefined;
            if (target) links.push(target);
          }
          walk(child);
        }
      }
    };
    walk(p);
    return text;
  };

  const visit = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      const name = localName(child);
      if (name === 'p') {
        lines.push(...paragraphText(child).split('\n'));
      } else if (name === 'tbl') {
        for (const row of Array.from(child.children).filter((c) => localName(c) === 'tr')) {
          const cells = Array.from(row.children)
            .filter((c) => localName(c) === 'tc')
            .map((cell) =>
              Array.from(cell.children)
                .filter((c) => localName(c) === 'p')
                .map(paragraphText)
                .join(' ')
                .trim(),
            );
          lines.push(cells.filter(Boolean).join('\t'));
        }
      } else {
        visit(child);
      }
    }
  };
  const body = Array.from(doc.getElementsByTagName('*')).find((el) => localName(el) === 'body');
  visit(body ?? doc.documentElement);
  return { lines, links };
}
