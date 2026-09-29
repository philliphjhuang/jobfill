/**
 * Fuzzy matching of desired answers against the options a form offers.
 * "Decline to self-identify" should find "I don't wish to answer", "US" should
 * find "United States of America", and "protected veteran" must NOT match
 * "I am not a protected veteran".
 */
import { containsWords, normalize, tokenDice } from './text';

export const MATCH_THRESHOLD = 0.5;

export function isPlaceholderOption(
  label: string,
  value: string | undefined,
  index: number,
): boolean {
  const n = normalize(label);
  if (!n) return true;
  if (index === 0 && value === '') return true;
  if (/^(please\s+)?(select|choose|pick)\b/.test(n) && n.length < 40) return true;
  if (n === 'none selected' || n === 'no selection' || n === 'none') return index === 0;
  return /^[-–—\s.]+$/.test(label);
}

const NEGATION = /\b(not|no|don t|dont|do not|never|non|without|decline|prefer not)\b/;

function hasNegation(raw: string): boolean {
  return NEGATION.test(normalize(raw.replace(/\([^)]*\)/g, ' ')));
}

/** Similarity in [0, 1] between an option label and one candidate answer. */
export function similarity(optionRaw: string, candidateRaw: string): number {
  const o = normalize(optionRaw);
  const c = normalize(candidateRaw);
  if (!o || !c) return 0;
  if (o === c) return 1;
  let score = 0;
  if (c.length >= 2 && o.length >= 2) {
    if (o.startsWith(`${c} `) || c.startsWith(`${o} `)) score = 0.9;
    else if (containsWords(o, c)) score = 0.85;
    else if (containsWords(c, o) && o.length >= 3) score = 0.75;
  }
  score = Math.max(score, tokenDice(o, c) * 0.8);
  if (score > 0 && hasNegation(optionRaw) !== hasNegation(candidateRaw)) score *= 0.3;
  return score;
}

export interface OptionMatch {
  index: number;
  score: number;
}

/**
 * Best option for an ordered list of candidate answers. Earlier candidates win
 * ties. Returns null when nothing clears the threshold.
 */
export function bestOption(
  options: ReadonlyArray<{ label: string; value?: string }>,
  candidates: readonly string[],
  threshold = MATCH_THRESHOLD,
): OptionMatch | null {
  let best: OptionMatch | null = null;
  candidates.forEach((cand, ci) => {
    options.forEach((opt, oi) => {
      if (isPlaceholderOption(opt.label, opt.value, oi)) return;
      let s = similarity(opt.label, cand);
      if (opt.value && opt.value !== opt.label && s < 1) {
        s = Math.max(s, similarity(opt.value, cand) * 0.95);
      }
      s -= ci * 0.005;
      if (s >= threshold && (!best || s > best.score)) best = { index: oi, score: s };
    });
  });
  return best;
}

function parseAmount(raw: string): number {
  const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!m) return NaN;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

/** Parses "3-5 years", "10+", "Less than 1", "$100k - $120k" into [min, max]. */
export function parseRange(label: string): [number, number] | null {
  const s = label.toLowerCase().replace(/,/g, '');
  const num = String.raw`\$?\s*(\d+(?:\.\d+)?\s*k?)`;
  let m = s.match(new RegExp(`${num}\\s*(?:-|–|—|to)\\s*${num}`));
  if (m) return [parseAmount(m[1]!), parseAmount(m[2]!)];
  m = s.match(
    new RegExp(
      `(?:less|fewer)\\s+than\\s*${num}|under\\s*${num}|below\\s*${num}|up\\s+to\\s*${num}`,
    ),
  );
  if (m) {
    const v = parseAmount((m[1] ?? m[2] ?? m[3] ?? m[4])!);
    return [Number.NEGATIVE_INFINITY, v - 1e-9];
  }
  m = s.match(
    new RegExp(
      `${num}\\s*(?:\\+|or\\s+more|and\\s+(?:above|up|over)|plus)|(?:more|greater)\\s+than\\s*${num}|over\\s*${num}|at\\s+least\\s*${num}`,
    ),
  );
  if (m) {
    const v = parseAmount((m[1] ?? m[2] ?? m[3] ?? m[4])!);
    return [m[2] || m[3] ? v + 1e-9 : v, Number.POSITIVE_INFINITY];
  }
  m = s.match(new RegExp(`^\\s*${num}\\s*(?:years?|yrs?)?\\s*$`));
  if (m) {
    const v = parseAmount(m[1]!);
    return [v, v];
  }
  return null;
}

/** Index of the option whose numeric range contains `n` (narrowest wins). */
export function bestNumericOption(options: ReadonlyArray<{ label: string }>, n: number): number {
  let best = -1;
  let bestWidth = Number.POSITIVE_INFINITY;
  options.forEach((opt, i) => {
    const r = parseRange(opt.label);
    if (!r || n < r[0] || n > r[1]) return;
    const width = r[1] - r[0];
    if (best < 0 || width < bestWidth) {
      best = i;
      bestWidth = width;
    }
  });
  return best;
}

export function looksLikeYesNo(options: ReadonlyArray<{ label: string; value?: string }>): boolean {
  const real = options.filter((o, i) => !isPlaceholderOption(o.label, o.value, i));
  if (real.length < 2 || real.length > 4) return false;
  const norms = real.map((o) => normalize(o.label));
  return (
    norms.some((n) => /^(yes|y|true)\b/.test(n)) && norms.some((n) => /^(no|n|false)\b/.test(n))
  );
}
