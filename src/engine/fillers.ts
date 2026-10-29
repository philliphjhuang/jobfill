/**
 * Writes resolved values into controls. Every filler reports what happened so
 * the verification pass and UI can explain the result.
 *
 * With pacing on, each filler first "approaches" its field (scrolls it into
 * view and pauses), text is typed one character at a time, and small steps
 * inside a field (opening a dropdown, picking an option) get a keystroke-length
 * pause.
 */
import { storedFileToFile } from '../shared/files';
import type { FillStatus } from '../shared/report';
import {
  blurQuietly,
  dispatchChange,
  dispatchInput,
  focusQuietly,
  getById,
  isVisible,
  pressKey,
  queryAllDeep,
  scrollIntoView,
  setNativeValue,
  simulateClick,
  sleep,
  textOf,
  typeValue,
  waitFor,
} from './dom';
import { bestNumericOption, bestOption } from './matcher';
import type { FieldOption, ScannedField } from './model';
import { RunAborted, type Pacer } from './pacing';
import type { Resolved } from './resolver';
import { isChecked } from './scanner';
import { NO, YES } from './synonyms';
import { cleanLabel } from './text';
import { clearText, typeText } from './typing';
import { readValue } from './values';

export interface FillOptions {
  overwrite: boolean;
  comboboxTimeoutMs: number;
  /** Human-like pacing; also where the user's Stop is noticed. */
  pacer: Pacer;
}

export interface FillOutcome {
  status: FillStatus;
  detail?: string;
}

const ok = (detail?: string): FillOutcome => ({ status: 'filled', detail });
const already: FillOutcome = { status: 'already-filled' };

function describe(r: Resolved): string {
  return r.text ?? r.candidates?.[0] ?? r.multi?.map((m) => m[0]).join(', ') ?? '';
}

/**
 * Stop the page's form from submitting while we click things (an "Add"
 * button without type="button" defaults to submit).
 */
export function withSubmitGuard<T>(doc: Document, action: () => T): T {
  const block = (e: Event): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  doc.addEventListener('submit', block, true);
  try {
    return action();
  } finally {
    setTimeout(() => doc.removeEventListener('submit', block, true), 0);
  }
}

function clickChoice(el: HTMLElement): void {
  withSubmitGuard(el.ownerDocument, () => {
    if (el.tagName === 'INPUT') el.click();
    else simulateClick(el);
  });
}

/**
 * Move to a field before touching it: bring it into view (paced runs, so the
 * user can follow along), then pause. Returns an outcome when the field was
 * removed from the page during the pause.
 */
async function approach(field: ScannedField, opts: FillOptions): Promise<FillOutcome | null> {
  if (opts.pacer.enabled) scrollIntoView(field.el);
  await opts.pacer.field();
  if (!field.el.isConnected) {
    return { status: 'failed', detail: 'The field changed while JobFill was waiting' };
  }
  return null;
}

function pickIndex(options: readonly FieldOption[], r: Resolved): number {
  if (r.number !== undefined) {
    const i = bestNumericOption(options, r.number);
    if (i >= 0) return i;
  }
  const lists: string[][] = [];
  if (r.candidates) lists.push(r.candidates);
  if (r.multi) lists.push(...r.multi);
  if (r.text) lists.push([r.text]);
  for (const list of lists) {
    const m = bestOption(options, list);
    if (m) return m.index;
  }
  return -1;
}

async function fillText(field: ScannedField, r: Resolved, opts: FillOptions): Promise<FillOutcome> {
  const el = field.el as HTMLInputElement | HTMLTextAreaElement;
  let value = r.text ?? r.candidates?.[0];
  if (!value) return { status: 'no-data' };
  if (!opts.overwrite && el.value.trim()) return already;
  if (el.maxLength > 0 && value.length > el.maxLength) value = value.slice(0, el.maxLength);
  if (el.type === 'number') {
    const n = value.replace(/[^\d.]/g, '');
    if (!n) return { status: 'no-match', detail: `"${value}" is not a number` };
    value = n;
  }
  const gone = await approach(field, opts);
  if (gone) return gone;
  // The page may have filled it meanwhile (e.g. from the uploaded resume).
  if (!opts.overwrite && el.value.trim()) return already;
  // Native date/month pickers only accept a complete value, so they are set in one go.
  if (opts.pacer.enabled && field.kind !== 'date') {
    clearText(el);
    await typeText(el, value, opts.pacer);
  } else {
    typeValue(el, value);
    blurQuietly(el);
  }
  return el.value.trim() ? ok(value) : { status: 'failed', detail: 'The page rejected the value' };
}

async function fillSelect(
  field: ScannedField,
  r: Resolved,
  opts: FillOptions,
): Promise<FillOutcome> {
  const sel = field.el as HTMLSelectElement;
  if (!opts.overwrite && readValue(field)) return already;
  const options: FieldOption[] = Array.from(sel.options).map((o) => ({
    label: cleanLabel(o.textContent ?? ''),
    value: o.value,
    el: o,
  }));
  let picked: number[];
  if (sel.multiple && r.multi?.length) {
    picked = r.multi.map((list) => bestOption(options, list)?.index ?? -1).filter((i) => i >= 0);
  } else {
    const idx = pickIndex(options, r);
    picked = idx >= 0 ? [idx] : [];
  }
  if (!picked.length) return { status: 'no-match', detail: `No option like "${describe(r)}"` };

  const gone = await approach(field, opts);
  if (gone) return gone;
  focusQuietly(sel);
  await opts.pacer.key(); // a moment to find the option in the list
  if (sel.multiple && r.multi?.length) {
    picked.forEach((i) => ((options[i]!.el as HTMLOptionElement).selected = true));
  } else {
    setNativeValue(sel, options[picked[0]!]!.value);
    (options[picked[0]!]!.el as HTMLOptionElement).selected = true;
  }
  dispatchInput(sel);
  dispatchChange(sel);
  blurQuietly(sel);
  return readValue(field) ? ok(readValue(field)) : { status: 'failed' };
}

async function fillRadio(
  field: ScannedField,
  r: Resolved,
  opts: FillOptions,
): Promise<FillOutcome> {
  if (!opts.overwrite && readValue(field)) return already;
  const idx = pickIndex(field.options, r);
  if (idx < 0) return { status: 'no-match', detail: `No option like "${describe(r)}"` };
  const option = field.options[idx]!;
  const gone = await approach(field, opts);
  if (gone) return gone;
  clickChoice(option.el);
  if (!isChecked(option.el)) {
    const label = (option.el as HTMLInputElement).labels?.[0];
    if (label) withSubmitGuard(option.el.ownerDocument, () => label.click());
  }
  return isChecked(option.el) ? ok(option.label) : { status: 'failed' };
}

async function fillCheckbox(
  field: ScannedField,
  r: Resolved,
  opts: FillOptions,
): Promise<FillOutcome> {
  const el = field.el;
  let desired: boolean;
  if (r.bool !== undefined) {
    desired = r.bool;
  } else {
    const label = field.options[0]?.label || field.label;
    const lists = r.multi ?? (r.candidates ? [r.candidates] : []);
    desired = lists.some((list) => bestOption([{ label }], list) !== null);
    if (!desired) return { status: 'skipped', detail: 'Not one of your answers' };
  }
  const checked = isChecked(el);
  if (checked === desired)
    return desired ? already : { status: 'skipped', detail: 'Left unchecked' };
  if (!desired && !opts.overwrite) return { status: 'skipped', detail: 'Left as is' };
  const gone = await approach(field, opts);
  if (gone) return gone;
  clickChoice(el);
  return isChecked(el) === desired ? ok(desired ? 'Checked' : 'Unchecked') : { status: 'failed' };
}

async function fillCheckboxGroup(
  field: ScannedField,
  r: Resolved,
  opts: FillOptions,
): Promise<FillOutcome> {
  if (!opts.overwrite && readValue(field)) return already;
  const lists =
    r.multi ?? (r.candidates ? [r.candidates] : r.bool !== undefined ? [r.bool ? YES : NO] : []);
  const picked = new Set<number>();
  for (const list of lists) {
    const m = bestOption(field.options, list);
    if (m) picked.add(m.index);
  }
  if (!picked.size) return { status: 'no-match', detail: `No option like "${describe(r)}"` };
  const gone = await approach(field, opts);
  if (gone) return gone;
  let clicks = 0;
  for (const i of picked) {
    const el = field.options[i]!.el;
    if (isChecked(el)) continue;
    if (clicks++) await opts.pacer.key();
    clickChoice(el);
  }
  return readValue(field) ? ok(readValue(field)) : { status: 'failed' };
}

/** Assign files to an <input type=file>; falls back when DataTransfer is unavailable. */
export function setInputFiles(input: HTMLInputElement, files: File[]): boolean {
  const w = (input.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
  try {
    const dt = new w.DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
  } catch {
    const list = Object.assign([...files], { item: (i: number) => files[i] ?? null });
    Object.defineProperty(input, 'files', { configurable: true, get: () => list });
  }
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  return (input.files?.length ?? 0) === files.length;
}

async function fillFile(field: ScannedField, r: Resolved, opts: FillOptions): Promise<FillOutcome> {
  if (!r.file) return { status: 'no-data' };
  const input = field.el as HTMLInputElement;
  if (!opts.overwrite && readValue(field)) return already;
  const gone = await approach(field, opts);
  if (gone) return gone;
  const w = (input.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
  const file = storedFileToFile(r.file, w.File);
  return setInputFiles(input, [file])
    ? ok(r.file.name)
    : { status: 'failed', detail: 'Upload was blocked' };
}

const LIBRARY_OPTION_SELECTOR = [
  '[role="option"]',
  '.select__option',
  '[class*="-option"]:not([class*="-options"])',
  '.pac-item',
  '.select2-results__option',
  '.chosen-results li',
  '.selectize-dropdown-content .option',
  '.choices__list--dropdown .choices__item',
  '[data-automation-id="promptOption"]',
  '[data-automation-id="menuItem"]',
].join(', ');

/** Options of the listbox a combobox controls (or the one that just opened). */
export function findListboxOptions(el: HTMLElement): FieldOption[] {
  const toOptions = (nodes: Element[]): FieldOption[] =>
    nodes
      .filter((n) => isVisible(n) && n.getAttribute('aria-disabled') !== 'true')
      .map((n) => {
        const label = cleanLabel(textOf(n, { includeButtons: true }));
        // Listbox items rarely carry a value; an empty one would read as a placeholder.
        return { label, value: n.getAttribute('data-value') || label, el: n as HTMLElement };
      })
      .filter((o) => o.label);

  const ids = `${el.getAttribute('aria-controls') ?? ''} ${el.getAttribute('aria-owns') ?? ''}`
    .split(/\s+/)
    .filter(Boolean);
  for (const id of ids) {
    const box = getById(el, id) ?? el.ownerDocument.getElementById(id);
    if (box) {
      const found = toOptions(Array.from(box.querySelectorAll(LIBRARY_OPTION_SELECTOR)));
      if (found.length) return found;
    }
  }
  const doc = el.ownerDocument;
  const boxes = queryAllDeep(doc, '[role="listbox"]').filter(isVisible);
  const box = boxes[boxes.length - 1];
  if (box) {
    const found = toOptions(Array.from(box.querySelectorAll(LIBRARY_OPTION_SELECTOR)));
    if (found.length) return found;
  }
  // Last resort: library menus without ARIA roles, but only inside something
  // that looks like an open dropdown, so we never click random page links.
  return toOptions(
    queryAllDeep(doc, LIBRARY_OPTION_SELECTOR).filter((n) => n.closest(DROPDOWN_CONTAINER)),
  );
}

const DROPDOWN_CONTAINER =
  '[class*="menu" i], [class*="dropdown" i], [class*="listbox" i], [class*="popover" i], [class*="results" i], .pac-container';

function closeCombobox(el: HTMLElement): void {
  pressKey(el, 'Escape');
  blurQuietly(el);
}

/** Put search text into a typeahead: typed per character when paced. */
async function enterSearch(
  input: HTMLInputElement,
  text: string,
  opts: FillOptions,
): Promise<void> {
  if (opts.pacer.enabled) {
    clearText(input);
    await typeText(input, text, opts.pacer, { commit: false });
  } else {
    setNativeValue(input, text);
    dispatchInput(input, text);
  }
}

async function fillCombobox(
  field: ScannedField,
  r: Resolved,
  opts: FillOptions,
): Promise<FillOutcome> {
  const el = field.el;
  if (!opts.overwrite && readValue(field)) return already;
  const candidates = [...(r.candidates ?? []), ...(r.multi?.flat() ?? [])];
  if (r.text && !candidates.includes(r.text)) candidates.push(r.text);
  if (!candidates.length) return { status: 'no-data' };
  const isInput = el.tagName === 'INPUT';
  const searches = isInput
    ? Array.from(new Set([r.searchText ?? r.text ?? candidates[0]!, ...candidates.slice(0, 3)]))
    : [''];

  const gone = await approach(field, opts);
  if (gone) return gone;
  focusQuietly(el);
  withSubmitGuard(el.ownerDocument, () => simulateClick(el));

  try {
    for (const search of searches) {
      if (isInput) await enterSearch(el as HTMLInputElement, search, opts);
      else pressKey(el, 'ArrowDown');
      const options = await waitFor(() => {
        const found = findListboxOptions(el);
        return found.length ? found : null;
      }, opts.comboboxTimeoutMs);
      if (!options) continue;
      const idx = pickIndex(options, { ...r, candidates });
      if (idx < 0) continue;
      const option = options[idx]!;
      await opts.pacer.key(); // read the list before choosing
      withSubmitGuard(el.ownerDocument, () => simulateClick(option.el));
      await sleep(60);
      if (!readValue(field)) {
        pressKey(el, 'Enter');
        await sleep(30);
      }
      blurQuietly(el);
      const value = readValue(field);
      return value ? ok(value) : { status: 'failed', detail: `Could not select "${option.label}"` };
    }

    // Free-text autocompletes (e.g. a location box without suggestions) keep the typed text.
    if (isInput && !el.getAttribute('aria-controls') && r.text) {
      if (opts.pacer.enabled) {
        if ((el as HTMLInputElement).value !== r.text) {
          clearText(el as HTMLInputElement);
          await typeText(el as HTMLInputElement, r.text, opts.pacer);
        } else {
          dispatchChange(el);
          blurQuietly(el);
        }
      } else {
        typeValue(el as HTMLInputElement, r.text);
        blurQuietly(el);
      }
      if (readValue(field)) return ok(r.text);
    }
  } catch (err) {
    if (err instanceof RunAborted) closeCombobox(el);
    throw err;
  }
  if (isInput) {
    setNativeValue(el as HTMLInputElement, '');
    dispatchInput(el, '');
  }
  closeCombobox(el);
  return { status: 'no-match', detail: `No option like "${describe(r)}"` };
}

export async function fillField(
  field: ScannedField,
  r: Resolved,
  opts: FillOptions,
): Promise<FillOutcome> {
  switch (field.kind) {
    case 'text':
    case 'textarea':
    case 'date':
      return fillText(field, r, opts);
    case 'select':
      return fillSelect(field, r, opts);
    case 'radio':
      return fillRadio(field, r, opts);
    case 'checkbox':
      return fillCheckbox(field, r, opts);
    case 'checkbox-group':
      return fillCheckboxGroup(field, r, opts);
    case 'file':
      return fillFile(field, r, opts);
    case 'combobox':
      return fillCombobox(field, r, opts);
    default:
      return { status: 'skipped' };
  }
}
