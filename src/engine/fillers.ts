/**
 * Writes resolved values into controls. Every filler reports what happened so
 * the verification pass and UI can explain the result.
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
  setNativeValue,
  simulateClick,
  sleep,
  textOf,
  typeValue,
  waitFor,
} from './dom';
import { bestNumericOption, bestOption } from './matcher';
import type { FieldOption, ScannedField } from './model';
import type { Resolved } from './resolver';
import { isChecked } from './scanner';
import { NO, YES } from './synonyms';
import { cleanLabel } from './text';
import { readValue } from './values';

export interface FillOptions {
  overwrite: boolean;
  comboboxTimeoutMs: number;
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

function fillText(field: ScannedField, r: Resolved, opts: FillOptions): FillOutcome {
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
  typeValue(el, value);
  blurQuietly(el);
  return el.value.trim() ? ok(value) : { status: 'failed', detail: 'The page rejected the value' };
}

function fillSelect(field: ScannedField, r: Resolved, opts: FillOptions): FillOutcome {
  const sel = field.el as HTMLSelectElement;
  if (!opts.overwrite && readValue(field)) return already;
  const options: FieldOption[] = Array.from(sel.options).map((o) => ({
    label: cleanLabel(o.textContent ?? ''),
    value: o.value,
    el: o,
  }));
  focusQuietly(sel);
  if (sel.multiple && r.multi?.length) {
    const picked = r.multi
      .map((list) => bestOption(options, list)?.index ?? -1)
      .filter((i) => i >= 0);
    if (!picked.length) return { status: 'no-match', detail: `No option like "${describe(r)}"` };
    picked.forEach((i) => ((options[i]!.el as HTMLOptionElement).selected = true));
  } else {
    const idx = pickIndex(options, r);
    if (idx < 0) return { status: 'no-match', detail: `No option like "${describe(r)}"` };
    setNativeValue(sel, options[idx]!.value);
    (options[idx]!.el as HTMLOptionElement).selected = true;
  }
  dispatchInput(sel);
  dispatchChange(sel);
  blurQuietly(sel);
  return readValue(field) ? ok(readValue(field)) : { status: 'failed' };
}

function fillRadio(field: ScannedField, r: Resolved, opts: FillOptions): FillOutcome {
  if (!opts.overwrite && readValue(field)) return already;
  const idx = pickIndex(field.options, r);
  if (idx < 0) return { status: 'no-match', detail: `No option like "${describe(r)}"` };
  const option = field.options[idx]!;
  clickChoice(option.el);
  if (!isChecked(option.el)) {
    const label = (option.el as HTMLInputElement).labels?.[0];
    if (label) withSubmitGuard(option.el.ownerDocument, () => label.click());
  }
  return isChecked(option.el) ? ok(option.label) : { status: 'failed' };
}

function fillCheckbox(field: ScannedField, r: Resolved, opts: FillOptions): FillOutcome {
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
  clickChoice(el);
  return isChecked(el) === desired ? ok(desired ? 'Checked' : 'Unchecked') : { status: 'failed' };
}

function fillCheckboxGroup(field: ScannedField, r: Resolved, opts: FillOptions): FillOutcome {
  if (!opts.overwrite && readValue(field)) return already;
  const lists =
    r.multi ?? (r.candidates ? [r.candidates] : r.bool !== undefined ? [r.bool ? YES : NO] : []);
  const picked = new Set<number>();
  for (const list of lists) {
    const m = bestOption(field.options, list);
    if (m) picked.add(m.index);
  }
  if (!picked.size) return { status: 'no-match', detail: `No option like "${describe(r)}"` };
  for (const i of picked) {
    const el = field.options[i]!.el;
    if (!isChecked(el)) clickChoice(el);
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

function fillFile(field: ScannedField, r: Resolved, opts: FillOptions): FillOutcome {
  if (!r.file) return { status: 'no-data' };
  const input = field.el as HTMLInputElement;
  if (!opts.overwrite && readValue(field)) return already;
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

  focusQuietly(el);
  withSubmitGuard(el.ownerDocument, () => simulateClick(el));

  for (const search of searches) {
    if (isInput) {
      setNativeValue(el as HTMLInputElement, search);
      dispatchInput(el, search);
    } else {
      pressKey(el, 'ArrowDown');
    }
    const options = await waitFor(() => {
      const found = findListboxOptions(el);
      return found.length ? found : null;
    }, opts.comboboxTimeoutMs);
    if (!options) continue;
    const idx = pickIndex(options, { ...r, candidates });
    if (idx < 0) continue;
    const option = options[idx]!;
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
    typeValue(el as HTMLInputElement, r.text);
    blurQuietly(el);
    if (readValue(field)) return ok(r.text);
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
