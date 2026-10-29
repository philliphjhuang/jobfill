/**
 * Plans how parsed resume data merges into the saved profile:
 *   - a profile field that is empty is filled right away;
 *   - a profile field that already holds a different value becomes a
 *     "conflict" the user answers with Yes / No / Edit.
 * Work and education entries are matched by company / school; entries the
 * profile doesn't have yet are added (nothing is replaced by adding).
 */
import { normalize, tokenDice } from '../engine/text';
import { createEducation, createWorkExperience } from '../shared/defaults';
import type { Education, Profile } from '../shared/types';
import { sameText, type ResumeData, type ResumeEducation, type ResumeWork } from './parse';

export type ChangeKind = 'text' | 'textarea' | 'month' | 'yesno' | 'file';

export interface FieldChange {
  /** Dot path into the profile, e.g. "personal.email" or "work.1.title". */
  path: string;
  label: string;
  kind: ChangeKind;
  /** Current value, formatted for display ('' when empty). */
  current: string;
  /** Value from the resume, formatted for display / editing. */
  proposed: string;
}

export interface ImportPlan {
  /** Applied automatically because the profile field was empty. */
  filled: FieldChange[];
  /** Need a Yes / No / Edit decision. */
  conflicts: FieldChange[];
  addedWork: number;
  addedEducation: number;
}

const yesNo = (b: boolean): string => (b ? 'Yes' : 'No');

function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]),
      obj,
    );
}

/** Write a (display-formatted) value back into the profile. */
export function applyChange(
  profile: Profile,
  change: Pick<FieldChange, 'path' | 'kind'>,
  value: string,
): void {
  const keys = change.path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce<Record<string, unknown>>(
    (acc, key) => acc[key] as Record<string, unknown>,
    profile as unknown as Record<string, unknown>,
  );
  target[last] = change.kind === 'yesno' ? /^y/i.test(value.trim()) : value;
}

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

function urlKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/+$/, '');
}

function same(kind: ChangeKind, path: string, a: string, b: string): boolean {
  if (/phone$/i.test(path)) return digits(a).endsWith(digits(b)) || digits(b).endsWith(digits(a));
  if (/^links\./.test(path)) return urlKey(a) === urlKey(b);
  if (kind === 'month' || kind === 'yesno') return a === b;
  return sameText(a, b);
}

class Planner {
  readonly plan: ImportPlan = { filled: [], conflicts: [], addedWork: 0, addedEducation: 0 };
  /** The profile as it was before the import, for "was this empty?" checks. */
  private readonly original: Profile;

  constructor(readonly profile: Profile) {
    this.original = structuredClone(profile);
  }

  field(path: string, label: string, proposed: string | boolean, kind: ChangeKind = 'text'): void {
    const value = typeof proposed === 'boolean' ? yesNo(proposed) : proposed.trim();
    if (!value) return;
    const raw = getPath(this.profile, path);
    const current = typeof raw === 'boolean' ? yesNo(raw) : String(raw ?? '').trim();
    if (same(kind, path, current, value)) return;
    const change: FieldChange = { path, label, kind, current, proposed: value };
    if (this.wasEmpty(path, raw)) {
      applyChange(this.profile, change, value);
      this.plan.filled.push(change);
    } else {
      this.plan.conflicts.push(change);
    }
  }

  /**
   * Text is empty when blank. A yes/no flag (e.g. "currently work here") has
   * no empty state, so it counts as empty only when its entry is new or held
   * no data before the import.
   */
  private wasEmpty(path: string, raw: unknown): boolean {
    if (typeof raw !== 'boolean') return String(raw ?? '').trim() === '';
    const entryPath = path.split('.').slice(0, 2).join('.');
    const before = getPath(this.original, entryPath) as Record<string, unknown> | undefined;
    return (
      !before || Object.entries(before).every(([k, v]) => k === 'id' || v === '' || v === false)
    );
  }
}

function similar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return (
    na === nb ||
    ` ${na} `.includes(` ${nb} `) ||
    ` ${nb} `.includes(` ${na} `) ||
    tokenDice(na, nb) >= 0.6
  );
}

/** Minor variants of the same name ("Acme Inc" / "Acme") — not worth a prompt. */
function nearlySame(current: string, proposed: string): boolean {
  if (!current.trim()) return false;
  return sameText(current, proposed) || tokenDice(normalize(current), normalize(proposed)) >= 0.75;
}

function matchIndex<T>(existing: readonly T[], used: Set<number>, test: (e: T) => boolean): number {
  return existing.findIndex((e, i) => !used.has(i) && test(e));
}

function planWork(p: Planner, work: ResumeWork[]): void {
  const used = new Set<number>();
  for (const w of work) {
    let idx = matchIndex(p.profile.work, used, (e) =>
      w.company ? similar(e.company, w.company) : !e.company && similar(e.title, w.title),
    );
    const name = w.company || w.title || 'position';
    if (idx < 0) {
      p.profile.work.push(createWorkExperience());
      idx = p.profile.work.length - 1;
      p.plan.addedWork++;
    }
    used.add(idx);
    const base = `work.${idx}`;
    const label = (field: string): string => `Work · ${name} — ${field}`;
    // The company is how the entry was matched; don't ask to swap "Acme Inc" for "Acme".
    if (!nearlySame(p.profile.work[idx]!.company, w.company)) {
      p.field(`${base}.company`, label('Company'), w.company);
    }
    p.field(`${base}.title`, label('Job title'), w.title);
    p.field(`${base}.location`, label('Location'), w.location);
    p.field(`${base}.startDate`, label('Start'), w.startDate, 'month');
    if (!w.current) p.field(`${base}.endDate`, label('End'), w.endDate, 'month');
    p.field(`${base}.current`, label('Currently work here'), w.current, 'yesno');
    p.field(`${base}.description`, label('Description'), w.description, 'textarea');
  }
}

function planEducation(p: Planner, education: ResumeEducation[]): void {
  const used = new Set<number>();
  for (const e of education) {
    let idx = matchIndex(p.profile.education, used, (x: Education) =>
      e.school ? similar(x.school, e.school) : !x.school && similar(x.degree, e.degree),
    );
    const name = e.school || e.degree || 'education';
    if (idx < 0) {
      p.profile.education.push(createEducation());
      idx = p.profile.education.length - 1;
      p.plan.addedEducation++;
    }
    used.add(idx);
    const base = `education.${idx}`;
    const label = (field: string): string => `Education · ${name} — ${field}`;
    if (!nearlySame(p.profile.education[idx]!.school, e.school)) {
      p.field(`${base}.school`, label('School'), e.school);
    }
    p.field(`${base}.degree`, label('Degree'), e.degree);
    p.field(`${base}.fieldOfStudy`, label('Field of study'), e.fieldOfStudy);
    p.field(`${base}.gpa`, label('GPA'), e.gpa);
    p.field(`${base}.startDate`, label('Start'), e.startDate, 'month');
    p.field(`${base}.endDate`, label('Graduation'), e.endDate, 'month');
  }
}

/**
 * Returns a copy of `profile` with every empty field filled from the resume,
 * plus the list of conflicts still awaiting a decision.
 */
export function planImport(
  profile: Profile,
  data: ResumeData,
): { profile: Profile; plan: ImportPlan } {
  const p = new Planner(structuredClone(profile));
  const d = data;
  p.field('personal.firstName', 'First name', d.personal.firstName);
  p.field('personal.middleName', 'Middle name', d.personal.middleName);
  p.field('personal.lastName', 'Last name', d.personal.lastName);
  p.field('personal.email', 'Email', d.personal.email);
  p.field('personal.phone', 'Phone', d.personal.phone);
  p.field('personal.phoneCountryCode', 'Phone country code', d.personal.phoneCountryCode);
  p.field('address.line1', 'Street address', d.address.line1);
  p.field('address.city', 'City', d.address.city);
  p.field('address.state', 'State / province', d.address.state);
  p.field('address.postalCode', 'ZIP / postal code', d.address.postalCode);
  p.field('address.country', 'Country', d.address.country);
  p.field('links.linkedin', 'LinkedIn', d.links.linkedin);
  p.field('links.github', 'GitHub', d.links.github);
  p.field('links.portfolio', 'Personal website / portfolio', d.links.portfolio);
  p.field('links.twitter', 'X / Twitter', d.links.twitter);
  p.field('links.other', 'Other link', d.links.other);
  p.field('summary', 'Professional summary', d.summary, 'textarea');
  p.field('skills', 'Skills', d.skills, 'textarea');
  p.field('languages', 'Languages spoken', d.languages);
  planWork(p, d.work);
  planEducation(p, d.education);
  return { profile: p.profile, plan: p.plan };
}
