/**
 * Figures out what a control is *about*: its label, the question a radio group
 * asks, and which section of the form (work, education, EEO) it lives in.
 */
import { getById, isOwnUi, textOf } from './dom';
import type { SectionInfo, SectionKind } from './model';
import { cleanLabel, normalize, normalizeIdentifier } from './text';

export const CONTROL_SELECTOR = [
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="combobox"]',
  '[role="radio"]',
  '[role="checkbox"]',
  'button[aria-haspopup="listbox"]',
].join(', ');

const HEADING_SELECTOR =
  'h1, h2, h3, h4, h5, h6, legend, [role="heading"], [class*="section-title" i], [class*="sectionTitle"], [class*="section-header" i]';

function escapeAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function textOfIds(el: Element, ids: string | null): string {
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => getById(el, id))
    .filter((n): n is Element => !!n && n !== el)
    .map((n) => textOf(n))
    .join(' ')
    .trim();
}

function labelElements(el: Element): Element[] {
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length) return Array.from(labels);
  const id = el.getAttribute('id');
  if (id) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const found = root.querySelectorAll?.(`label[for="${escapeAttr(id)}"]`);
    if (found?.length) return Array.from(found);
  }
  const wrapping = el.closest('label');
  return wrapping ? [wrapping] : [];
}

function containsControl(el: Element): boolean {
  return el.matches(CONTROL_SELECTOR) || !!el.querySelector(CONTROL_SELECTOR);
}

/**
 * Text immediately before `el` in its layout block: walks previous siblings,
 * then climbs ancestors, stopping as soon as it would cross another control.
 */
export function precedingText(el: Element, maxDepth = 5): string {
  let node: Element = el;
  for (let depth = 0; depth < maxDepth; depth++) {
    for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
      if (sib.nodeType === 3) {
        const t = (sib.nodeValue ?? '').trim();
        if (t) return t;
        continue;
      }
      if (sib.nodeType !== 1) continue;
      const se = sib as Element;
      if (isOwnUi(se)) continue;
      if (containsControl(se)) return '';
      const t = textOf(se);
      if (t) return t.length <= 250 ? t : '';
    }
    const parent = node.parentElement;
    if (!parent || parent.tagName === 'FORM' || parent.tagName === 'BODY') return '';
    node = parent;
  }
  return '';
}

function ownLabel(el: Element): string {
  const byIds = textOfIds(el, el.getAttribute('aria-labelledby'));
  if (byIds) return byIds;
  const fromLabels = labelElements(el)
    .map((l) => textOf(l))
    .filter(Boolean)
    .join(' ');
  if (fromLabels) return fromLabels;
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria;
  const before = precedingText(el);
  if (before) return before;
  return el.getAttribute('title') ?? '';
}

/**
 * Label of a small control group (e.g. a date split into Month/Year inputs,
 * or a phone split into code/number), used when the control's own label is
 * too generic on its own.
 */
function groupLabel(el: Element): string {
  const group = el.parentElement?.closest('[role="group"], fieldset');
  if (!group || group.querySelectorAll(CONTROL_SELECTOR).length > 4) return '';
  if (group.tagName === 'FIELDSET') {
    const legend = group.querySelector(':scope > legend');
    return legend ? textOf(legend) : '';
  }
  return (
    textOfIds(group, group.getAttribute('aria-labelledby')) ||
    (group.getAttribute('aria-label') ?? '')
  );
}

/** Raw label text for a single control (may include "*" markers). */
export function rawLabelFor(el: Element): string {
  const own = ownLabel(el);
  if (normalize(own).split(' ').filter(Boolean).length <= 2) {
    const group = groupLabel(el);
    if (group && !normalize(own).includes(normalize(group))) return `${group} ${own}`.trim();
  }
  return own;
}

/** Supplementary hints: placeholder, aria-describedby, title, aria-label. */
export function hintFor(el: Element): string {
  return normalize(
    [
      el.getAttribute('placeholder'),
      el.getAttribute('data-placeholder'),
      textOfIds(el, el.getAttribute('aria-describedby')),
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

const ID_ATTRS = [
  'name',
  'id',
  'data-automation-id',
  'data-qa',
  'data-testid',
  'data-test',
  'data-field',
];

export function attrsFor(el: Element): string {
  return normalizeIdentifier(
    ID_ATTRS.map((a) => el.getAttribute(a))
      .filter(Boolean)
      .join(' '),
  );
}

/** Label of one radio/checkbox option. */
export function optionLabelFor(input: Element): string {
  const fromLabels = labelElements(input)
    .map((l) => textOf(l))
    .filter(Boolean)
    .join(' ');
  if (fromLabels) return cleanLabel(fromLabels);
  const aria =
    input.getAttribute('aria-label') ?? textOfIds(input, input.getAttribute('aria-labelledby'));
  if (aria.trim()) return cleanLabel(aria);
  if (input.getAttribute('role') && input.tagName !== 'INPUT') {
    const own = textOf(input);
    if (own) return cleanLabel(own);
  }
  for (let sib = input.nextSibling; sib; sib = sib.nextSibling) {
    if (sib.nodeType === 3 && sib.nodeValue?.trim()) return cleanLabel(sib.nodeValue);
    if (sib.nodeType === 1) {
      if (containsControl(sib as Element)) break;
      const t = textOf(sib);
      if (t) return cleanLabel(t);
    }
  }
  const parent = input.parentElement;
  if (parent && parent.querySelectorAll(CONTROL_SELECTOR).length === 1) {
    const t = textOf(parent);
    if (t) return cleanLabel(t);
  }
  return (input as HTMLInputElement).value ?? '';
}

function commonAncestor(nodes: Element[]): Element | null {
  const first = nodes[0];
  if (!first) return null;
  for (let anc = first.parentElement; anc; anc = anc.parentElement) {
    if (nodes.every((n) => anc.contains(n))) return anc;
  }
  return null;
}

/** Text of `container`'s children that don't hold any form control. */
function textOutsideControls(container: Element): string {
  const parts: string[] = [];
  for (let c = container.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) parts.push(c.nodeValue ?? '');
    else if (c.nodeType === 1 && !containsControl(c as Element) && !isOwnUi(c as Element)) {
      parts.push(textOf(c));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** The question asked by a radio/checkbox group (or a lone checkbox). */
export function groupQuestionFor(inputs: Element[]): string {
  const first = inputs[0];
  if (!first) return '';
  const fieldset = first.closest('fieldset');
  if (fieldset && inputs.every((i) => fieldset.contains(i))) {
    const legend = fieldset.querySelector(':scope > legend');
    const t = legend ? textOf(legend) : '';
    if (t) return t;
  }
  const group = first.closest('[role="radiogroup"], [role="group"]');
  if (group && inputs.every((i) => group.contains(i))) {
    const t =
      textOfIds(group, group.getAttribute('aria-labelledby')) ||
      (group.getAttribute('aria-label') ?? '');
    if (t.trim()) return t;
  }
  let anc = inputs.length > 1 ? commonAncestor(inputs) : first.parentElement;
  for (let depth = 0; anc && depth < 4; depth++) {
    if (anc.tagName === 'FORM' || anc.tagName === 'BODY') break;
    const t = textOutsideControls(anc);
    if (t && t.length <= 300) return t;
    const before = precedingText(anc, 1);
    if (before) return before;
    anc = anc.parentElement;
  }
  return '';
}

export function isRequired(el: Element, rawLabel: string): boolean {
  if ((el as HTMLInputElement).required) return true;
  if (el.getAttribute('aria-required') === 'true') return true;
  if (/\(optional\)/i.test(rawLabel)) return false;
  return /[*✱]|\brequired\b/i.test(rawLabel);
}

const SECTION_PATTERNS: Array<[SectionKind, RegExp]> = [
  [
    'eeo',
    /\bvoluntary\b|\bself\s*identif|\beeo\b|\bequal\s*(employment\s*)?opportunit|\bdemographic|\bdiversity\b|\bdisability\b|\bveterans?\b/,
  ],
  ['education', /\beducation\b|\bschools?\b|\buniversit|\bacademic\b|\bdegrees?\b/],
  [
    'work',
    /\bexperiences?\b|\bemployment\b|\bwork\s*history\b|\bemployers?\b|\bprofessional\s*history\b|\bcareer\s*history\b|\bpositions?\s*held\b/,
  ],
];

const SECTION_NOISE = /\b(candidate|applicant|user|application)\s*experience\b/g;

export function sectionKindOf(text: string): SectionKind | null {
  const cleaned = text.replace(SECTION_NOISE, ' ');
  for (const [kind, re] of SECTION_PATTERNS) if (re.test(cleaned)) return kind;
  return null;
}

function indexFromText(text: string): number | undefined {
  const m = text.match(/\b(\d{1,2})\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n - 1 : undefined;
}

/** Resolves the enclosing section of controls; caches heading lookups per scan. */
export class SectionResolver {
  private headings = new Map<Element, Element[]>();

  private headingsIn(anc: Element): Element[] {
    let list = this.headings.get(anc);
    if (!list) {
      list = Array.from(anc.querySelectorAll(HEADING_SELECTOR));
      this.headings.set(anc, list);
    }
    return list;
  }

  private precedingHeading(anc: Element, el: Element): Element | null {
    const list = this.headingsIn(anc);
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i]!;
      if (h.contains(el)) continue;
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        const text = textOf(h);
        if (text && text.length <= 80) return h;
      }
    }
    return null;
  }

  resolve(el: Element): SectionInfo {
    let depth = 0;
    for (let anc = el.parentElement; anc && depth < 30; anc = anc.parentElement, depth++) {
      if (anc.tagName === 'BODY' || anc.tagName === 'HTML') break;
      // Identifier attributes can carry an entry number ("workExperience-2"); class
      // names only help find the kind (utility classes like "mt-4" are not numbers).
      const idText = normalizeIdentifier(
        [
          anc.id,
          anc.getAttribute('data-automation-id'),
          anc.getAttribute('data-qa'),
          anc.getAttribute('data-testid'),
        ]
          .filter(Boolean)
          .join(' '),
      );
      const classText = normalizeIdentifier(
        [typeof anc.className === 'string' ? anc.className : '', anc.getAttribute('aria-label')]
          .filter(Boolean)
          .join(' '),
      );
      const attrText = `${idText} ${classText}`.trim();
      const kindFromAttrs = attrText ? sectionKindOf(attrText) : null;
      if (kindFromAttrs && anc.querySelectorAll(CONTROL_SELECTOR).length <= 30) {
        const labelled = normalize(textOfIds(anc, anc.getAttribute('aria-labelledby')));
        return {
          kind: kindFromAttrs,
          text: attrText,
          index: indexFromText(labelled) ?? indexFromText(idText),
        };
      }
      const heading = this.precedingHeading(anc, el);
      if (heading) {
        const text = normalize(textOf(heading));
        const kind = sectionKindOf(text) ?? 'none';
        return { kind, text, index: kind === 'none' ? undefined : indexFromText(text) };
      }
    }
    return { kind: 'none', text: '' };
  }
}
