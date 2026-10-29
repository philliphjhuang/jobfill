/**
 * Repeating sections: numbering work/education entries on the page and
 * clicking "Add another" until there is a slot for every profile entry.
 */
import { SectionResolver } from './context';
import { isDisabled, isVisible, queryAllDeep, textOf, waitForDomSettled } from './dom';
import { datePartOf } from './dates';
import { withSubmitGuard } from './fillers';
import type { ClassifiedField } from './model';
import { normalize } from './text';

type EntryKind = 'work' | 'education';

const PREFIX: Record<EntryKind, string> = { work: 'work.', education: 'edu.' };

/**
 * Assign each work/education field the index of the entry it belongs to.
 * Numbered headings ("Education 2") win; otherwise a new entry starts whenever
 * a field type repeats in page order.
 */
export function assignEntryIndices(fields: ClassifiedField[]): void {
  for (const kind of ['work', 'education'] as const) {
    let index = -1;
    let seen = new Set<string>();
    for (const f of fields) {
      const c = f.classification;
      if (!c || !c.type.startsWith(PREFIX[kind])) continue;
      if (f.section.kind !== kind) {
        c.index = 0;
        continue;
      }
      if (f.section.index !== undefined) {
        c.index = f.section.index;
        index = Math.max(index, f.section.index);
        continue;
      }
      const key = `${c.type}:${datePartOf(f)}`;
      if (index < 0 || seen.has(key)) {
        index++;
        seen = new Set();
      }
      seen.add(key);
      c.index = index;
    }
  }
}

export function countEntries(fields: ClassifiedField[], kind: EntryKind): number {
  let max = -1;
  for (const f of fields) {
    const c = f.classification;
    if (c && f.section.kind === kind && c.type.startsWith(PREFIX[kind]))
      max = Math.max(max, c.index);
  }
  return max + 1;
}

const ADD_TEXT = /^\+?\s*(add|add another|add more|add new|new)\b/;
const NOT_ENTRY =
  /\b(file|files|attachment|resume|cv|cover|link|links|url|website|skill|skills|language|languages|certification|certificate|license|reference|references|document|question|photo|image|dropbox|drive|manually|note|comment)\b/;
const EXPLICIT: Record<EntryKind, RegExp> = {
  work: /\b(experience|employment|work|job|position|employer)\b/,
  education: /\b(education|school|degree|university|college)\b/,
};

export function findAddButton(doc: Document, kind: EntryKind): HTMLElement | null {
  const other: EntryKind = kind === 'work' ? 'education' : 'work';
  const sections = new SectionResolver();
  const buttons = queryAllDeep<HTMLElement>(
    doc,
    'button, a, [role="button"], input[type="button"]',
  );
  const matches = buttons.filter((b) => {
    if (!isVisible(b) || isDisabled(b)) return false;
    const label = normalize(
      textOf(b, { includeButtons: true }) ||
        b.getAttribute('aria-label') ||
        (b as HTMLInputElement).value ||
        '',
    );
    const aria = normalize(b.getAttribute('aria-label'));
    if (!ADD_TEXT.test(label) && !ADD_TEXT.test(aria)) return false;
    const all = `${label} ${aria}`;
    if (NOT_ENTRY.test(all)) return false;
    if (EXPLICIT[kind].test(all)) return true;
    if (EXPLICIT[other].test(all)) return false;
    return sections.resolve(b).kind === kind;
  });
  return matches[matches.length - 1] ?? null;
}

export interface EnsureEntriesOptions {
  quietMs: number;
  maxMs: number;
  /** Called before each click (human-like pause; throws if the user stopped). */
  beforeClick?: (kind: EntryKind) => Promise<void>;
}

/**
 * Click "Add" buttons until the page offers as many entries as the profile
 * has. Returns true when the DOM changed and fields must be rescanned.
 */
export async function ensureEntries(
  doc: Document,
  rescan: () => ClassifiedField[],
  wanted: Record<EntryKind, number>,
  opts: EnsureEntriesOptions,
): Promise<boolean> {
  let changed = false;
  let fields = rescan();
  for (const kind of ['work', 'education'] as const) {
    const want = Math.min(wanted[kind], 10);
    let have = countEntries(fields, kind);
    let attempts = 0;
    while (have < want && attempts < want + 1) {
      attempts++;
      const button = findAddButton(doc, kind);
      if (!button) break;
      await opts.beforeClick?.(kind);
      if (!button.isConnected) break;
      withSubmitGuard(doc, () => button.click());
      await waitForDomSettled(doc.body, opts.quietMs, opts.maxMs);
      fields = rescan();
      const next = countEntries(fields, kind);
      if (next <= have) break;
      have = next;
      changed = true;
    }
  }
  return changed;
}
