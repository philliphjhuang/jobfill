/**
 * Scores every rule against a scanned field and picks the most likely type.
 *
 * Signal strength (base score):
 *   site-specific hint 120 > autocomplete attribute 100 > custom answer 75–90 >
 *   label 60 > name/id attributes 40 > placeholder 35
 * Rule priorities (±10) break ties between overlapping rules.
 */
import type { CustomAnswer } from '../shared/types';
import { CONTROL_SELECTOR } from './context';
import type { Classification, ClassifiedField, FieldType, ScannedField } from './model';
import { AUTOCOMPLETE_MAP, PEOPLE_NOT, RULES } from './rules';
import { containsWords, normalize, tokenDice, tokens } from './text';

export interface FieldHint {
  selector: string;
  type: FieldType;
}

export interface ClassifyOptions {
  customAnswers?: readonly CustomAnswer[];
  hints?: readonly FieldHint[];
}

const MIN_SCORE = 30;

const PERSONAL_TYPES = new Set<FieldType>([
  'firstName',
  'lastName',
  'middleName',
  'fullName',
  'preferredName',
  'email',
  'phone',
]);

const AUTOCOMPLETE_KINDS = new Set(['text', 'select', 'combobox', 'textarea']);

function matchesHint(el: Element, selector: string): boolean {
  try {
    if (el.matches(selector)) return true;
    let depth = 0;
    for (let anc = el.parentElement; anc && depth < 3; anc = anc.parentElement, depth++) {
      if (anc.matches(selector)) return anc.querySelectorAll(CONTROL_SELECTOR).length === 1;
    }
  } catch {
    /* invalid selector in an adapter — ignore */
  }
  return false;
}

function customScore(field: ScannedField, answer: CustomAnswer): number {
  const q = normalize(answer.question);
  if (!q || !answer.answer.trim() || !field.labelNorm) return 0;
  if (field.kind === 'file') return 0;
  const qTokens = tokens(q);
  if (field.labelNorm === q || containsWords(field.labelNorm, q)) {
    return qTokens.length >= 3 ? 90 : 75;
  }
  // Every keyword of the question appears in the label, in any order.
  const labelTokens = new Set(tokens(field.labelNorm));
  if (qTokens.length >= 2 && qTokens.every((t) => labelTokens.has(t))) return 72;
  const dice = tokenDice(field.labelNorm, q);
  return dice >= 0.6 ? 40 + dice * 40 : 0;
}

export function classifyField(
  field: ScannedField,
  opts: ClassifyOptions = {},
): Classification | null {
  for (const hint of opts.hints ?? []) {
    if (matchesHint(field.el, hint.selector)) {
      return { type: hint.type, score: 120, source: 'hint', index: 0 };
    }
  }

  let best: Classification | null = null;
  const consider = (c: Classification): void => {
    if (c.score >= MIN_SCORE && (!best || c.score > best.score)) best = c;
  };

  if (field.autocomplete && AUTOCOMPLETE_KINDS.has(field.kind)) {
    const token = field.autocomplete
      .split(/\s+/)
      .reverse()
      .find((t) => AUTOCOMPLETE_MAP[t]);
    if (token)
      consider({ type: AUTOCOMPLETE_MAP[token]!, score: 100, source: 'autocomplete', index: 0 });
  }

  const texts: Array<[string, number, Classification['source']]> = [
    [field.labelNorm, 60, 'label'],
    [field.attrs, 40, 'attr'],
    [field.hint, 35, 'placeholder'],
  ];
  // Upload widgets are often labelled only by their section ("Resume/CV" heading).
  if (field.kind === 'file') texts.push([field.section.text, 45, 'label']);

  for (const rule of RULES) {
    if (rule.kinds && !rule.kinds.includes(field.kind)) continue;
    if (rule.sections && !rule.sections.includes(field.section.kind)) continue;
    if (rule.notSections?.includes(field.section.kind)) continue;
    let base = 0;
    let source: Classification['source'] = 'label';
    let matches = 0;
    for (const [text, weight, src] of texts) {
      if (!text || !rule.match.test(text)) continue;
      if (rule.not?.test(text)) continue;
      if (PERSONAL_TYPES.has(rule.type) && PEOPLE_NOT.test(text)) continue;
      matches++;
      if (weight > base) {
        base = weight;
        source = src;
      }
    }
    // A strong negative in the label vetoes weaker attribute matches.
    if (base > 0 && base < 60 && field.labelNorm && rule.not?.test(field.labelNorm)) continue;
    if (base > 0) {
      consider({
        type: rule.type,
        score: base + (rule.priority ?? 0) + (matches - 1) * 5,
        source,
        index: 0,
      });
    }
  }

  for (const answer of opts.customAnswers ?? []) {
    const score = customScore(field, answer);
    if (score > 0)
      consider({ type: 'custom', score, source: 'custom', index: 0, customId: answer.id });
  }

  const byOptions = classifyByOptions(field);
  if (byOptions) consider({ type: byOptions, score: 45, source: 'label', index: 0 });

  return best;
}

const CHOICE_KINDS = new Set(['select', 'radio', 'checkbox-group']);

/**
 * When the question text is unhelpful ("Please check one of the boxes below"),
 * the answers themselves often reveal what is being asked.
 */
export function classifyByOptions(field: ScannedField): FieldType | null {
  if (!CHOICE_KINDS.has(field.kind) || field.options.length < 2) return null;
  const labels = field.options.map((o) => normalize(o.label));
  const all = ` ${labels.join(' | ')} `;
  const has = (re: RegExp): boolean => labels.some((l) => re.test(l));
  if (has(/\bdisabilit/)) return 'disability';
  if (has(/\bveteran\b/)) return 'veteran';
  if (has(/^(male|man)$/) && has(/^(female|woman)$/)) return 'gender';
  if (/\basian\b/.test(all) && /\b(white|black)\b/.test(all)) return 'race';
  if (has(/\bhispanic\b|\blatin[oax]\b/) && has(/^(yes|no)\b/)) return 'hispanic';
  return null;
}

export function classifyAll(fields: ScannedField[], opts: ClassifyOptions = {}): ClassifiedField[] {
  const out: ClassifiedField[] = fields.map((f) => ({
    ...f,
    classification: classifyField(f, opts),
  }));
  // A lone unlabeled upload on an application form is almost always the resume.
  if (!out.some((f) => f.classification?.type === 'resume')) {
    const upload = out.find((f) => f.kind === 'file' && !f.classification);
    if (upload) upload.classification = { type: 'resume', score: 31, source: 'label', index: 0 };
  }
  return out;
}
