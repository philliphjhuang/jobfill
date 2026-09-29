/** Date handling: profile dates are stored as YYYY-MM or YYYY-MM-DD. */
import { isPlaceholderOption } from './matcher';
import type { ScannedField } from './model';
import { MONTHS, monthCandidates } from './synonyms';
import { normalize } from './text';

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export type DatePart = 'month' | 'year' | 'day' | 'full';

export function parseDate(value: string): DateParts | null {
  const m = value.trim().match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

const pad = (n: number): string => String(n).padStart(2, '0');

function optionsAre(field: ScannedField, test: (label: string) => boolean): boolean {
  const real = field.options.filter((o, i) => !isPlaceholderOption(o.label, o.value, i));
  if (real.length < 3) return false;
  return real.filter((o) => test(o.label)).length / real.length >= 0.7;
}

const MONTH_NAMES = new Set(MONTHS.flatMap((m) => [normalize(m), normalize(m.slice(0, 3))]));

/** Which part of a date this control wants (separate month/year inputs are common). */
export function datePartOf(field: ScannedField): DatePart {
  if (field.options.length) {
    if (optionsAre(field, (l) => /^\s*(19|20)\d{2}\s*$/.test(l))) return 'year';
    if (
      optionsAre(field, (l) => MONTH_NAMES.has(normalize(l)) || /^\s*(0?[1-9]|1[0-2])\s*$/.test(l))
    ) {
      return 'month';
    }
  }
  const text = `${field.attrs} ${field.labelNorm} ${field.hint}`;
  const hasMonth = /\bmonth\b|\bmm\b/.test(text);
  const hasYear = /\byear\b|\byyyy\b|\byy\b/.test(text);
  const hasDay = /\bday\b|\bdd\b/.test(text);
  if (hasMonth && !hasYear && !hasDay) return 'month';
  if (hasYear && !hasMonth && !hasDay) return 'year';
  return 'full';
}

/** Text value for a date control, following its placeholder's format when there is one. */
export function formatDateFor(
  field: ScannedField,
  d: DateParts,
  fallback: 'month-year' | 'full-date' = 'month-year',
): string {
  if (field.kind === 'date') {
    if (field.inputType === 'month') return `${d.year}-${pad(d.month)}`;
    return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
  }
  const part = datePartOf(field);
  if (part === 'month') return pad(d.month);
  if (part === 'year') return String(d.year);
  if (part === 'day') return pad(d.day);

  const raw = (field.el.getAttribute('placeholder') ?? '').toLowerCase();
  const sep = raw.includes('-') ? '-' : raw.includes('.') ? '.' : '/';
  const pattern = normalize(`${field.hint} ${field.labelNorm}`);
  const name = MONTHS[d.month - 1]!;
  if (/\bmm dd yyyy\b/.test(pattern)) return [pad(d.month), pad(d.day), d.year].join(sep);
  if (/\bdd mm yyyy\b/.test(pattern)) return [pad(d.day), pad(d.month), d.year].join(sep);
  if (/\byyyy mm dd\b/.test(pattern)) return [d.year, pad(d.month), pad(d.day)].join(sep);
  if (/\byyyy mm\b/.test(pattern)) return [d.year, pad(d.month)].join(sep);
  if (/\bmm yy\b(?! ?yy)/.test(pattern) && !/\bmm yyyy\b/.test(pattern)) {
    return [pad(d.month), String(d.year).slice(2)].join(sep);
  }
  if (/\bmonth (yyyy|year)\b/.test(pattern)) return `${name} ${d.year}`;
  if (/\bmm yyyy\b/.test(pattern)) return [pad(d.month), d.year].join(sep);
  return fallback === 'full-date'
    ? [pad(d.month), pad(d.day), d.year].join(sep)
    : [pad(d.month), d.year].join(sep);
}

/** Choice candidates for select/radio/combobox date controls. */
export function dateCandidates(field: ScannedField, d: DateParts): string[] {
  const part = datePartOf(field);
  if (part === 'month') return monthCandidates(d.month);
  if (part === 'year') return [String(d.year)];
  const name = MONTHS[d.month - 1]!;
  return [
    `${name} ${d.year}`,
    `${name.slice(0, 3)} ${d.year}`,
    `${pad(d.month)}/${d.year}`,
    String(d.year),
  ];
}

/** Years between the earliest start and the latest end (or today). */
export function totalYears(
  ranges: Array<{ start: string; end: string; current: boolean }>,
  now = new Date(),
): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const r of ranges) {
    const s = parseDate(r.start);
    if (!s) continue;
    const e = r.current ? { year: now.getFullYear(), month: now.getMonth() + 1 } : parseDate(r.end);
    if (!e) continue;
    min = Math.min(min, s.year * 12 + s.month);
    max = Math.max(max, e.year * 12 + e.month);
  }
  if (!Number.isFinite(min) || max < min) return 0;
  return Math.floor((max - min) / 12);
}
