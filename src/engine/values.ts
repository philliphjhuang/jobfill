/** Reads the value a control currently shows, for every kind of control. */
import { CONTROL_SELECTOR } from './context';
import { textOf } from './dom';
import { isPlaceholderOption } from './matcher';
import type { ScannedField } from './model';
import { isChecked } from './scanner';
import { normalize } from './text';

const VALUE_SELECTORS = [
  '[class*="singleValue"]',
  '[class*="single-value"]',
  '[class*="multiValue"]',
  '[class*="multi-value"]',
  '[class*="selectedValue"]',
  '[class*="selected-value"]',
  '[data-automation-id="selectedItem"]',
  '[class*="select2-selection__rendered"]',
  '[class*="chosen-single"] span',
].join(', ');

export function isPlaceholderText(value: string): boolean {
  const n = normalize(value);
  return !n || /^(please\s+)?(select|choose|pick|search)\b/.test(n) || /^[-–—.\s]+$/.test(value);
}

export function comboboxValue(el: HTMLElement): string {
  if (el.tagName === 'INPUT') {
    const v = (el as HTMLInputElement).value.trim();
    if (v) return v;
  }
  let depth = 0;
  for (let anc = el.parentElement; anc && depth < 4; anc = anc.parentElement, depth++) {
    if (anc.querySelectorAll(CONTROL_SELECTOR).length > 1) break;
    const shown = anc.querySelector(VALUE_SELECTORS);
    const shownText = shown ? textOf(shown) : '';
    if (shownText && !isPlaceholderText(shownText)) return shownText;
    const hidden = anc.querySelector<HTMLInputElement>('input[type="hidden"]');
    if (hidden?.value.trim()) return hidden.value.trim();
  }
  if (el.tagName !== 'INPUT') {
    const own = textOf(el, { includeButtons: true });
    if (own && !isPlaceholderText(own)) return own;
  }
  return '';
}

const FILE_NAME = /[\w\s().-]+\.(pdf|docx?|rtf|txt|odt|pages)\b/i;

export function readValue(field: ScannedField): string {
  const el = field.el;
  switch (field.kind) {
    case 'text':
    case 'textarea':
    case 'date':
      return (el as HTMLInputElement).value.trim();
    case 'select': {
      const sel = el as HTMLSelectElement;
      const chosen = Array.from(sel.selectedOptions ?? []).filter(
        (o) => !isPlaceholderOption(o.textContent ?? '', o.value, o.index),
      );
      return chosen.map((o) => (o.textContent ?? '').trim()).join(', ');
    }
    case 'radio':
    case 'checkbox-group':
      return field.options
        .filter((o) => isChecked(o.el))
        .map((o) => o.label || 'checked')
        .join(', ');
    case 'checkbox':
      return isChecked(el) ? 'checked' : '';
    case 'file': {
      const files = (el as HTMLInputElement).files;
      if (files && files.length) return Array.from(files, (f) => f.name).join(', ');
      // Many ATSs upload immediately, clear the input and show the file name nearby.
      const container =
        el.closest('fieldset, [class*="upload" i], [class*="attach" i], [class*="file" i]') ??
        el.parentElement;
      const shown = container
        ? textOf(container, { includeButtons: false }).match(FILE_NAME)
        : null;
      return shown ? shown[0].trim() : '';
    }
    case 'combobox':
      return comboboxValue(el);
    default:
      return '';
  }
}
