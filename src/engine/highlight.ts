/** Outlines fields on the page so the user can see what still needs attention. */
import { queryAllDeep } from './dom';
import type { ScannedField } from './model';

export type HighlightLevel = 'required' | 'optional' | 'filled';

const FLAG = 'data-jobfill-flag';
const PREV = 'data-jobfill-prev-style';

const STYLES: Record<HighlightLevel, { outline: string; offset: string }> = {
  required: { outline: '2px solid #dc2626', offset: '2px' },
  optional: { outline: '2px dashed #d97706', offset: '2px' },
  filled: { outline: '2px solid rgba(22, 163, 74, 0.55)', offset: '1px' },
};

/** The element worth outlining: groups and hidden file inputs use their container. */
export function highlightTarget(field: ScannedField): HTMLElement {
  if (field.kind === 'radio' || field.kind === 'checkbox-group') {
    const fieldset = field.el.closest('fieldset, [role="radiogroup"], [role="group"]');
    if (fieldset && field.inputs.every((i) => fieldset.contains(i))) return fieldset as HTMLElement;
    let anc = field.el.parentElement;
    while (anc && !field.inputs.every((i) => anc!.contains(i))) anc = anc.parentElement;
    return anc ?? field.el;
  }
  if (field.kind === 'file' || field.kind === 'checkbox') return field.el.parentElement ?? field.el;
  return field.el;
}

export function highlight(el: HTMLElement, level: HighlightLevel): void {
  if (!el.hasAttribute(PREV)) {
    el.setAttribute(PREV, `${el.style.outline}|${el.style.outlineOffset}`);
  }
  el.setAttribute(FLAG, level);
  el.style.outline = STYLES[level].outline;
  el.style.outlineOffset = STYLES[level].offset;
}

export function clearHighlights(root: Document): void {
  for (const el of queryAllDeep<HTMLElement>(root, `[${FLAG}]`)) {
    const [outline = '', offset = ''] = (el.getAttribute(PREV) ?? '|').split('|');
    el.style.outline = outline;
    el.style.outlineOffset = offset;
    el.removeAttribute(FLAG);
    el.removeAttribute(PREV);
  }
}

/** Briefly pulse an element after scrolling to it. */
export function flash(el: HTMLElement): void {
  const prev = el.style.boxShadow;
  el.style.transition = 'box-shadow 0.3s ease';
  el.style.boxShadow = '0 0 0 6px rgba(79, 70, 229, 0.45)';
  setTimeout(() => {
    el.style.boxShadow = prev;
  }, 1200);
}
