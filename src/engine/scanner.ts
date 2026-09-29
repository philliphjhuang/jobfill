/**
 * Discovers every fillable control on the page and describes it
 * (kind, label, hints, section, options) without deciding what it is.
 */
import {
  attrsFor,
  CONTROL_SELECTOR,
  groupQuestionFor,
  hintFor,
  isRequired,
  optionLabelFor,
  rawLabelFor,
  SectionResolver,
} from './context';
import { closestDeep, collectElements, isDisabled, isVisible } from './dom';
import type { ControlKind, FieldOption, ScannedField } from './model';
import { cleanLabel, focusQuestion, normalize } from './text';

const EXCLUDED_REGIONS =
  'header, nav, footer, [role="search"], [role="navigation"], [role="banner"], [role="contentinfo"]';

const SKIPPED_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'password',
  'search',
  'range',
  'color',
]);

function inputType(el: Element): string {
  if (el.tagName === 'INPUT') return ((el as HTMLInputElement).type || 'text').toLowerCase();
  return el.tagName.toLowerCase();
}

export function controlKind(el: Element): ControlKind | null {
  const role = el.getAttribute('role');
  if (el.tagName === 'INPUT') {
    const type = inputType(el);
    if (SKIPPED_INPUT_TYPES.has(type)) return null;
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'file') return 'file';
    if (['date', 'month', 'week', 'datetime-local'].includes(type)) return 'date';
    const autocomplete = el.getAttribute('aria-autocomplete');
    if (role === 'combobox' || autocomplete === 'list' || autocomplete === 'both')
      return 'combobox';
    return 'text';
  }
  if (el.tagName === 'SELECT') return 'select';
  if (el.tagName === 'TEXTAREA') return 'textarea';
  if (role === 'radio') return 'radio';
  if (role === 'checkbox') return 'checkbox';
  if (role === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') {
    // Prefer an inner input (e.g. a wrapper div with role=combobox around a text box).
    if (el.querySelector('input:not([type="hidden"]), select, textarea')) return null;
    return 'combobox';
  }
  return null;
}

/** Radios, checkboxes and file inputs are often visually hidden behind styled labels. */
function isControlVisible(el: HTMLElement, kind: ControlKind): boolean {
  if (kind === 'file') return !el.closest('[hidden]');
  if (isVisible(el)) return true;
  if (kind === 'radio' || kind === 'checkbox') {
    const labels = (el as HTMLInputElement).labels;
    if (labels && Array.from(labels).some((l) => isVisible(l))) return true;
    const parent = el.parentElement;
    return !!parent && isVisible(parent);
  }
  return false;
}

export function isChecked(el: Element): boolean {
  if (el.tagName === 'INPUT') return (el as HTMLInputElement).checked;
  return el.getAttribute('aria-checked') === 'true';
}

function groupMembers(
  el: HTMLElement,
  kind: 'radio' | 'checkbox',
  pool: HTMLElement[],
): HTMLElement[] {
  if (el.tagName === 'INPUT') {
    const name = (el as HTMLInputElement).name;
    if (!name) return [el];
    const form = (el as HTMLInputElement).form;
    return pool.filter(
      (other) =>
        other.tagName === 'INPUT' &&
        (other as HTMLInputElement).type === kind &&
        (other as HTMLInputElement).name === name &&
        (other as HTMLInputElement).form === form,
    );
  }
  const group = el.closest('[role="radiogroup"], [role="group"]');
  if (!group) return [el];
  return pool.filter((other) => other.getAttribute('role') === kind && group.contains(other));
}

function isReadOnly(el: Element, kind: ControlKind): boolean {
  if (kind === 'combobox' || kind === 'file') return false;
  return (el as HTMLInputElement).readOnly === true || el.getAttribute('aria-readonly') === 'true';
}

function build(
  el: HTMLElement,
  inputs: HTMLElement[],
  kind: ControlKind,
  rawLabel: string,
  options: FieldOption[],
  sections: SectionResolver,
): ScannedField {
  const label = cleanLabel(rawLabel);
  return {
    el,
    inputs,
    kind,
    inputType: inputType(el),
    label,
    labelNorm: normalize(focusQuestion(label)),
    hint: hintFor(el),
    attrs: attrsFor(el),
    autocomplete: (el.getAttribute('autocomplete') ?? '').toLowerCase().trim(),
    section: sections.resolve(el),
    options,
    required: inputs.some((i) => isRequired(i, rawLabel || (el.getAttribute('placeholder') ?? ''))),
    multiple: kind === 'checkbox-group' || (el as HTMLSelectElement).multiple === true,
    readOnly: isReadOnly(el, kind),
  };
}

export function scanFields(root: ParentNode): ScannedField[] {
  const sections = new SectionResolver();
  const all = collectElements(root, (el) => el.matches(CONTROL_SELECTOR)) as HTMLElement[];
  const radios = all.filter((el) => controlKind(el) === 'radio');
  const checkboxes = all.filter((el) => controlKind(el) === 'checkbox');
  const handled = new Set<Element>();
  const fields: ScannedField[] = [];

  for (const el of all) {
    if (handled.has(el)) continue;
    const kind = controlKind(el);
    if (!kind) continue;
    if (closestDeep(el, EXCLUDED_REGIONS)) continue;
    if (isDisabled(el) || !isControlVisible(el, kind)) continue;

    if (kind === 'radio' || kind === 'checkbox') {
      const members = groupMembers(el, kind, kind === 'radio' ? radios : checkboxes).filter(
        (m) => !isDisabled(m) && isControlVisible(m, kind),
      );
      members.forEach((m) => handled.add(m));
      const options = members.map((m) => ({
        label: optionLabelFor(m),
        value: (m as HTMLInputElement).value ?? '',
        el: m,
      }));
      if (kind === 'checkbox' && members.length <= 1) {
        const optionLabel = options[0]?.label ?? '';
        const question = groupQuestionFor([el]);
        const combined =
          question && normalize(question) !== normalize(optionLabel)
            ? `${question} ${optionLabel}`
            : optionLabel || question;
        fields.push(build(el, [el], 'checkbox', combined, options, sections));
        continue;
      }
      const question = groupQuestionFor(members) || rawLabelFor(el);
      fields.push(
        build(
          el,
          members,
          kind === 'radio' ? 'radio' : 'checkbox-group',
          question,
          options,
          sections,
        ),
      );
      continue;
    }

    handled.add(el);
    let options: FieldOption[] = [];
    if (kind === 'select') {
      options = Array.from((el as HTMLSelectElement).options).map((o) => ({
        label: cleanLabel(o.textContent ?? ''),
        value: o.value,
        el: o,
      }));
    }
    fields.push(build(el, [el], kind, rawLabelFor(el), options, sections));
  }
  return fields;
}
