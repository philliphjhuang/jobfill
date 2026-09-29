/**
 * Turns a classified field + the stored profile into the value to enter.
 * Pure function: no DOM writes happen here.
 */
import type {
  Documents,
  Education,
  Profile,
  StoredFile,
  WorkExperience,
  YesNo,
} from '../shared/types';
import { dateCandidates, formatDateFor, parseDate, totalYears } from './dates';
import { looksLikeYesNo, parseRange } from './matcher';
import type { ClassifiedField } from './model';
import {
  ARRANGEMENT,
  countryCandidates,
  DECLINE,
  degreeCandidates,
  DISABILITY,
  GENDER,
  hearAboutCandidates,
  HISPANIC,
  isUnitedStates,
  NO,
  ORIENTATION,
  PHONE_TYPE,
  RACE,
  stateForms,
  TRANSGENDER,
  VETERAN,
  YES,
} from './synonyms';
import { normalize } from './text';

export interface Resolved {
  /** Value for free-text controls. */
  text?: string;
  /** Ordered acceptable answers for single-choice controls. */
  candidates?: string[];
  /** One candidate list per answer for multi-choice controls. */
  multi?: string[][];
  /** Desired state for single checkboxes / yes-no questions. */
  bool?: boolean;
  /** Numeric value for range-style options ("3-5 years", "$100k-$120k"). */
  number?: number;
  file?: StoredFile;
  /** What to type into a searchable dropdown before picking an option. */
  searchText?: string;
  /** Deliberately left blank (e.g. end date of a current job). */
  skipReason?: string;
}

export interface ResolveContext {
  profile: Profile;
  documents: Documents;
}

function text(value: string | undefined | null, extra: string[] = []): Resolved | null {
  const v = value?.trim();
  if (!v) return null;
  return { text: v, candidates: [v, ...extra] };
}

function yesNoValue(yes: boolean): Resolved {
  return { text: yes ? 'Yes' : 'No', candidates: yes ? YES : NO, bool: yes };
}

function yesNo(v: YesNo, invert = false): Resolved | null {
  if (!v) return null;
  return yesNoValue(invert ? v !== 'yes' : v === 'yes');
}

function choice(candidates: string[] | undefined, label?: string): Resolved | null {
  if (!candidates?.length) return null;
  return { text: label ?? candidates[0], candidates };
}

function ym(value: string): number {
  const d = parseDate(value);
  return d ? d.year * 12 + d.month : 0;
}

/** Most recent first: current roles, then by end date, then start date. */
export function orderedWork(work: readonly WorkExperience[]): WorkExperience[] {
  return [...work].sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      ym(b.endDate) - ym(a.endDate) ||
      ym(b.startDate) - ym(a.startDate),
  );
}

export function orderedEducation(education: readonly Education[]): Education[] {
  return [...education].sort(
    (a, b) => ym(b.endDate) - ym(a.endDate) || ym(b.startDate) - ym(a.startDate),
  );
}

function dateValue(
  field: ClassifiedField,
  value: string,
  fallback: 'month-year' | 'full-date' = 'month-year',
): Resolved | null {
  const d = parseDate(value);
  if (!d) return null;
  return { text: formatDateFor(field, d, fallback), candidates: dateCandidates(field, d) };
}

function questionText(field: ClassifiedField): string {
  return `${field.labelNorm} ${field.hint}`;
}

function isYesNoField(field: ClassifiedField): boolean {
  return field.kind === 'checkbox' || looksLikeYesNo(field.options);
}

function phoneValue(field: ClassifiedField, p: Profile): Resolved | null {
  const national = p.personal.phone.trim();
  if (!national) return null;
  if (national.startsWith('+')) return text(national);
  const code = p.personal.phoneCountryCode.trim();
  const placeholder = (field.el.getAttribute('placeholder') ?? '').trim();
  const wantsIntl =
    placeholder.startsWith('+') ||
    /\b(country\s*code|international|include\s*(your\s*)?country)\b/.test(questionText(field));
  return text(wantsIntl && code ? `${code} ${national}` : national);
}

function phoneCodeValue(p: Profile): Resolved | null {
  const code = p.personal.phoneCountryCode.trim();
  if (!code) return null;
  const country = p.address.country.trim();
  const digits = code.replace(/\D/g, '');
  const candidates = country
    ? [`${country} (${code})`, `${country} ${code}`, ...countryCandidates(country), code, digits]
    : [code, digits];
  return { text: code, candidates };
}

function stateValue(p: Profile): Resolved | null {
  const state = p.address.state.trim();
  if (!state) return null;
  const forms = stateForms(state);
  return { text: state, candidates: forms ? [state, forms.full, forms.abbr] : [state] };
}

function locationValue(p: Profile): Resolved | null {
  const { city, state, country } = p.address;
  if (!city.trim()) return null;
  const forms = stateForms(state);
  const us = !country || isUnitedStates(country);
  const primary = us
    ? [city, forms?.abbr ?? state].filter(Boolean).join(', ')
    : [city, state, country].filter(Boolean).join(', ');
  const candidates = [primary];
  if (forms) candidates.push(`${city}, ${forms.full}`, `${city}, ${forms.full}, United States`);
  candidates.push(city);
  return { text: primary, candidates, searchText: primary };
}

function workArrangementValue(field: ClassifiedField, p: Profile): Resolved | null {
  const modes = p.preferences.workArrangements;
  if (!modes.length) return null;
  if (isYesNoField(field)) {
    const q = questionText(field);
    const mentioned = (Object.keys(ARRANGEMENT) as Array<keyof typeof ARRANGEMENT>).filter((m) =>
      ARRANGEMENT[m].some((syn) => new RegExp(`\\b${normalize(syn)}\\b`).test(q)),
    );
    if (!mentioned.length) return null;
    return yesNoValue(mentioned.some((m) => modes.includes(m)));
  }
  return {
    text: modes.map((m) => ARRANGEMENT[m][0]).join(', '),
    candidates: modes.flatMap((m) => ARRANGEMENT[m]),
    multi: modes.map((m) => ARRANGEMENT[m]),
  };
}

function preferredLocationsValue(field: ClassifiedField, p: Profile): Resolved | null {
  const locs = p.preferences.preferredLocations;
  if (!locs.length) return null;
  const lists = locs.map((l) => {
    const city = l.split(',')[0]!.trim();
    return city && city !== l ? [l, city] : [l];
  });
  if (isYesNoField(field)) {
    const q = questionText(field);
    const hit = lists.some((list) => list.some((l) => q.includes(normalize(l))));
    return hit ? yesNoValue(true) : null;
  }
  return { text: locs.join('; '), candidates: lists.flat(), multi: lists };
}

function citizenshipValue(field: ClassifiedField, p: Profile): Resolved | null {
  const citizenship = p.preferences.citizenship.trim();
  if (!citizenship) return null;
  if (isYesNoField(field)) {
    if (!/\b(u s|us|usa|united states|america|american)\b/.test(questionText(field))) return null;
    return yesNoValue(isUnitedStates(citizenship));
  }
  return { text: citizenship, candidates: countryCandidates(citizenship) };
}

function effectiveRaces(p: Profile): string[] {
  const races: string[] = [...p.eeo.race];
  if (p.eeo.hispanicLatino === 'yes' && !races.includes('hispanic')) races.unshift('hispanic');
  return races;
}

function hispanicValue(p: Profile): Resolved | null {
  const h = p.eeo.hispanicLatino;
  if (h) return choice(HISPANIC[h]);
  const races = p.eeo.race;
  if (!races.length) return null;
  if (races.includes('decline')) return choice(DECLINE);
  return choice(races.includes('hispanic') ? HISPANIC.yes : HISPANIC.no);
}

function raceValue(field: ClassifiedField, p: Profile): Resolved | null {
  if (
    isYesNoField(field) &&
    field.kind !== 'checkbox' &&
    /\bhispanic|\blatin/.test(questionText(field))
  ) {
    return hispanicValue(p);
  }
  const races = effectiveRaces(p);
  if (!races.length) return null;
  if (races.includes('decline')) return choice(DECLINE);
  const lists = races.map((r) => RACE[r as keyof typeof RACE] ?? [r]);
  const single = races.length > 1 ? [...RACE.two_or_more, ...lists.flat()] : lists.flat();
  return { text: lists.map((l) => l[0]).join(', '), candidates: single, multi: lists };
}

function veteranValue(field: ClassifiedField, p: Profile): Resolved | null {
  const v = p.eeo.veteran;
  if (!v) return null;
  if (looksLikeYesNo(field.options) && v !== 'decline') {
    return yesNoValue(v === 'protected_veteran' || v === 'veteran');
  }
  return choice(VETERAN[v]);
}

function customValue(field: ClassifiedField, p: Profile): Resolved | null {
  const answer = p.customAnswers
    .find((c) => c.id === field.classification?.customId)
    ?.answer.trim();
  if (!answer) return null;
  const n = normalize(answer);
  if (n === 'yes' || n === 'no') return yesNoValue(n === 'yes');
  return { text: answer, candidates: [answer], searchText: answer };
}

function numberValue(raw: string): number | undefined {
  const r = parseRange(raw);
  return r && Number.isFinite(r[0]) ? r[0] : undefined;
}

export function resolveValue(field: ClassifiedField, ctx: ResolveContext): Resolved | null {
  const c = field.classification;
  if (!c) return null;
  const p = ctx.profile;
  const pers = p.personal;
  const addr = p.address;
  const pref = p.preferences;
  const eeo = p.eeo;

  switch (c.type) {
    case 'firstName':
      return text(pers.firstName);
    case 'middleName':
      return text(pers.middleName);
    case 'lastName':
      return text(pers.lastName);
    case 'preferredName':
      return text(pers.preferredName || pers.firstName);
    case 'fullName':
      return text([pers.firstName, pers.lastName].filter(Boolean).join(' '));
    case 'email':
      return text(pers.email);
    case 'phone':
      return phoneValue(field, p);
    case 'phoneCountryCode':
      return phoneCodeValue(p);
    case 'phoneType':
      return choice(PHONE_TYPE);
    case 'address1':
      return text(addr.line1);
    case 'address2':
      return text(addr.line2);
    case 'city':
      return text(addr.city);
    case 'state':
      return stateValue(p);
    case 'postalCode':
      return text(addr.postalCode);
    case 'country':
      return addr.country.trim()
        ? { text: addr.country.trim(), candidates: countryCandidates(addr.country) }
        : null;
    case 'location':
      return locationValue(p);
    case 'linkedin':
      return text(p.links.linkedin);
    case 'github':
      return text(p.links.github);
    case 'portfolio':
      return text(p.links.portfolio);
    case 'twitter':
      return text(p.links.twitter);
    case 'otherUrl':
      return text(p.links.other || p.links.portfolio);
    case 'resume':
      return ctx.documents.resume ? { file: ctx.documents.resume } : null;
    case 'coverLetter':
      if (field.kind === 'file')
        return ctx.documents.coverLetter ? { file: ctx.documents.coverLetter } : null;
      return text(p.coverLetter);

    case 'work.company':
    case 'work.title':
    case 'work.location':
    case 'work.start':
    case 'work.end':
    case 'work.current':
    case 'work.description': {
      const w = orderedWork(p.work)[c.index];
      if (!w) return null;
      switch (c.type) {
        case 'work.company':
          return text(w.company);
        case 'work.title':
          return text(w.title);
        case 'work.location':
          return text(w.location);
        case 'work.start':
          return dateValue(field, w.startDate);
        case 'work.end':
          return w.current
            ? { skipReason: 'Current position — no end date' }
            : dateValue(field, w.endDate);
        case 'work.current':
          return yesNoValue(w.current);
        default:
          return text(w.description);
      }
    }

    case 'edu.school':
    case 'edu.degree':
    case 'edu.field':
    case 'edu.gpa':
    case 'edu.start':
    case 'edu.end': {
      const e = orderedEducation(p.education)[c.index];
      if (!e) return null;
      switch (c.type) {
        case 'edu.school':
          return text(e.school);
        case 'edu.degree':
          return e.degree.trim()
            ? { text: e.degree.trim(), candidates: degreeCandidates(e.degree) }
            : null;
        case 'edu.field':
          return text(e.fieldOfStudy);
        case 'edu.gpa':
          return text(e.gpa);
        case 'edu.start':
          return dateValue(field, e.startDate);
        default:
          return dateValue(field, e.endDate);
      }
    }

    case 'yearsExperience': {
      const explicit = pref.yearsOfExperience.trim();
      const years = explicit
        ? Number.parseFloat(explicit)
        : totalYears(
            p.work.map((w) => ({ start: w.startDate, end: w.endDate, current: w.current })),
          );
      if (!Number.isFinite(years) || (!explicit && !p.work.length)) return null;
      return { text: String(years), candidates: [String(years)], number: years };
    }
    case 'workAuthorization':
      return yesNo(pref.authorizedToWork);
    case 'sponsorship': {
      const q = questionText(field);
      // "Are you authorized to work ... without sponsorship?" is the inverse question.
      const inverse = /\bwithout\b(\s+\w+){0,4}\s+sponsor/.test(q) && !/\brequire\b/.test(q);
      return yesNo(pref.requiresSponsorship, inverse);
    }
    case 'relocate':
      return yesNo(pref.willingToRelocate);
    case 'over18':
      return yesNo(pref.over18, /\bunder\b/.test(questionText(field)));
    case 'preferredLocations':
      return preferredLocationsValue(field, p);
    case 'workArrangement':
      return workArrangementValue(field, p);
    case 'salary':
      return pref.desiredSalary.trim()
        ? { ...text(pref.desiredSalary)!, number: numberValue(pref.desiredSalary) }
        : null;
    case 'noticePeriod':
      return text(pref.noticePeriod);
    case 'availableStart': {
      if (field.kind === 'date' && pref.earliestStartDate)
        return dateValue(field, pref.earliestStartDate, 'full-date');
      if (pref.availability.trim()) return text(pref.availability);
      return pref.earliestStartDate ? dateValue(field, pref.earliestStartDate, 'full-date') : null;
    }
    case 'howHeard':
      return pref.howDidYouHear.trim()
        ? { text: pref.howDidYouHear.trim(), candidates: hearAboutCandidates(pref.howDidYouHear) }
        : null;
    case 'clearance':
      return text(pref.securityClearance);
    case 'citizenship':
      return citizenshipValue(field, p);
    case 'skills':
      return text(p.skills);
    case 'languages':
      return text(p.languages);
    case 'summary':
      return text(p.summary);

    case 'gender':
      return eeo.gender ? choice(GENDER[eeo.gender]) : null;
    case 'pronouns':
      return text(eeo.pronouns);
    case 'race':
      return raceValue(field, p);
    case 'hispanic':
      return hispanicValue(p);
    case 'veteran':
      return veteranValue(field, p);
    case 'disability':
      return eeo.disability ? choice(DISABILITY[eeo.disability]) : null;
    case 'sexualOrientation':
      return eeo.sexualOrientation ? choice(ORIENTATION[eeo.sexualOrientation]) : null;
    case 'transgender':
      return eeo.transgender ? choice(TRANSGENDER[eeo.transgender]) : null;
    case 'custom':
      return customValue(field, p);
    default:
      return null;
  }
}
