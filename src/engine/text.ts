/** Text normalization helpers shared by the classifier and option matcher. */

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Split identifiers like `legalNameSection_firstName` or `urls[LinkedIn]` into words. */
export function splitIdentifier(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.[\]:/]+/g, ' ');
}

/**
 * Lowercase, strip accents/punctuation/required markers and collapse whitespace.
 * "First Name *" -> "first name", "Résumé/CV" -> "resume cv".
 */
export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/\((required|optional)\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeIdentifier(s: string | null | undefined): string {
  return s ? normalize(splitIdentifier(s)) : '';
}

/** Collapse whitespace without changing case, for labels shown to the user. */
export function cleanLabel(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/\s*[*✱]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'for',
  'and',
  'or',
  'is',
  'are',
  'you',
  'your',
  'do',
  'does',
  'did',
  'have',
  'has',
  'with',
  'at',
  'by',
  'be',
  'please',
  'if',
  'any',
  'this',
  'that',
  'we',
  'our',
  'i',
  'me',
  'my',
]);

export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Sørensen–Dice coefficient over significant word tokens. */
export function tokenDice(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return (2 * common) / (ta.size + tb.size);
}

/** True when `needle` appears in `haystack` on word boundaries (both normalized). */
export function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

/** Long labels (legal disclaimers, paragraphs) are trimmed to the question itself. */
export function focusQuestion(label: string): string {
  if (label.length <= 160) return label;
  const questions = label.match(/[^.?!]*\?/g);
  if (questions && questions.length > 0) {
    return questions[questions.length - 1]!.trim();
  }
  return label.slice(0, 160);
}
