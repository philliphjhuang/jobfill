/**
 * Heuristic resume parser: text lines → structured profile data.
 *
 * Pipeline: clean lines → split into sections by headings (Experience,
 * Education, Skills…) → contact details from the top block → entries found
 * around date ranges ("Jan 2020 – Present") in the experience section and
 * around school names in the education section.
 *
 * Pure function; see tests/unit/resume-parse.test.ts for supported layouts.
 */
import { canonicalCountry, countryCandidates, stateForms } from '../engine/synonyms';
import { normalize, tokenDice } from '../engine/text';
import type { ExtractedText } from './extract';

export interface ResumeWork {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface ResumeEducation {
  school: string;
  degree: string;
  fieldOfStudy: string;
  gpa: string;
  startDate: string;
  endDate: string;
}

export interface ResumeData {
  personal: {
    firstName: string;
    middleName: string;
    lastName: string;
    email: string;
    phone: string;
    phoneCountryCode: string;
  };
  address: { line1: string; city: string; state: string; postalCode: string; country: string };
  links: { linkedin: string; github: string; portfolio: string; twitter: string; other: string };
  work: ResumeWork[];
  education: ResumeEducation[];
  skills: string;
  languages: string;
  summary: string;
}

// ── Line cleanup ─────────────────────────────────────────────────────────────

const LIGATURES: Record<string, string> = {
  '\ufb01': 'fi',
  '\ufb02': 'fl',
  '\ufb00': 'ff',
  '\ufb03': 'ffi',
  '\ufb04': 'ffl',
};

function cleanLine(line: string): string {
  return line
    .replace(/[\ufb01\ufb02\ufb00\ufb03\ufb04]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/ ?\t ?/g, '\t')
    .trim();
}

const BULLET =
  /^(?:[\u2022\u00b7\u25aa\u25ba\u27a2\u2713\u25cf\u25cb\u25a0\u25c6\u25e6\u2023\u2043\u2219*]|[-\u2013\u2014](?=\s)|[\ue000-\uf8ff])\s*/;

export const isBullet = (line: string): boolean => BULLET.test(line);
const stripBullet = (line: string): string => line.replace(BULLET, '').trim();

// ── Sections ─────────────────────────────────────────────────────────────────

type SectionName = 'summary' | 'work' | 'education' | 'skills' | 'languages' | 'other';

const SECTION_ALIASES: Record<SectionName, string[]> = {
  summary: [
    'summary',
    'professional summary',
    'profile',
    'professional profile',
    'objective',
    'career objective',
    'about',
    'about me',
    'overview',
    'executive summary',
    'personal statement',
    'summary of qualifications',
  ],
  work: [
    'experience',
    'work experience',
    'professional experience',
    'employment',
    'employment history',
    'work history',
    'relevant experience',
    'career history',
    'industry experience',
    'internship experience',
    'internships',
    'research experience',
    'professional background',
    'experience and internships',
    'relevant work experience',
  ],
  education: [
    'education',
    'academic background',
    'education and training',
    'academics',
    'educational background',
    'academic history',
    'education and certifications',
  ],
  skills: [
    'skills',
    'technical skills',
    'core competencies',
    'competencies',
    'technologies',
    'technical proficiencies',
    'skills and interests',
    'skills and abilities',
    'key skills',
    'tools and technologies',
    'skills summary',
    'areas of expertise',
    'expertise',
    'technical expertise',
    'skills and technologies',
  ],
  languages: ['languages', 'language skills', 'spoken languages'],
  other: [
    'projects',
    'personal projects',
    'academic projects',
    'selected projects',
    'certifications',
    'certificates',
    'licenses and certifications',
    'awards',
    'honors',
    'honors and awards',
    'awards and honors',
    'publications',
    'volunteer',
    'volunteer experience',
    'volunteering',
    'leadership',
    'leadership experience',
    'activities',
    'extracurricular activities',
    'extracurriculars',
    'interests',
    'hobbies',
    'references',
    'coursework',
    'relevant coursework',
    'achievements',
    'involvement',
    'affiliations',
    'memberships',
    'additional information',
    'additional',
  ],
};

export function sectionOf(line: string): SectionName | null {
  if (!line || line.length > 50 || line.includes('\t')) return null;
  const n = normalize(line.replace(/[:\uff1a]\s*$/, ''));
  if (!n) return null;
  for (const [name, aliases] of Object.entries(SECTION_ALIASES) as Array<[SectionName, string[]]>) {
    if (aliases.includes(n)) return name;
  }
  // "PROFESSIONAL EXPERIENCE & PROJECTS" style headings: all caps, a few words.
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && n.split(' ').length <= 5) {
    for (const [name, aliases] of Object.entries(SECTION_ALIASES) as Array<
      [SectionName, string[]]
    >) {
      if (aliases.some((a) => n.startsWith(`${a} `))) return name;
    }
  }
  return null;
}

// ── Dates ────────────────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_SRC =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_SRC = `(?:(?:${MONTH_SRC})\\.?,?\\s+(?:19|20)\\d{2}|(?:spring|summer|fall|autumn|winter)\\s+(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])\\/(?:19|20)\\d{2}|(?:19|20)\\d{2}[-/.](?:0?[1-9]|1[0-2])(?!\\d)|(?:19|20)\\d{2})`;
const PRESENT_SRC = 'present|current|now|today|ongoing|date';
const RANGE_RE = new RegExp(
  `\\b(${DATE_SRC})\\s*(?:-|–|—|to|until|till|through|thru|~)\\s*(${DATE_SRC}|${PRESENT_SRC})\\b`,
  'i',
);
const SINGLE_RE = new RegExp(
  `\\b(?:expected|anticipated|graduat\\w*|class of)?:?\\s*(${DATE_SRC})\\b`,
  'gi',
);
const SEASONS: Record<string, number> = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 };

/** "Mar 2022" / "03/2022" / "2022-03" / "Fall 2019" / "2022" → "YYYY-MM" (year-only → January). */
export function toYearMonth(token: string): string {
  const t = token.toLowerCase().replace(/[.,]/g, ' ').trim();
  let m = t.match(/^([a-z]+)\s+(\d{4})$/);
  if (m) {
    const month = SEASONS[m[1]!] ?? MONTHS.indexOf(m[1]!.slice(0, 3)) + 1;
    return month > 0 ? `${m[2]}-${String(month).padStart(2, '0')}` : '';
  }
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1]!.padStart(2, '0')}`;
  m = t.match(/^(\d{4})[-/ ](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}`;
  m = t.match(/^(\d{4})$/);
  return m ? `${m[1]}-01` : '';
}

interface DateRange {
  start: string;
  end: string;
  current: boolean;
}

export function findRange(text: string): DateRange | null {
  const m = text.match(RANGE_RE);
  if (!m) return null;
  const current = new RegExp(`^(${PRESENT_SRC})$`, 'i').test(m[2]!.trim());
  return { start: toYearMonth(m[1]!), end: current ? '' : toYearMonth(m[2]!), current };
}

const removeDates = (text: string): string =>
  text
    .replace(RANGE_RE, ' ')
    .replace(SINGLE_RE, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

// ── Parts, locations, titles ─────────────────────────────────────────────────

/** Split a header line on column gaps and visual separators (not commas). */
function splitParts(line: string): string[] {
  return line
    .split(/\t|\s[|•·]\s|\s*\|\s*|\s{2,}|\s[–—]\s|\s-\s/)
    .map((p) =>
      p
        .trim()
        .replace(/^[,;:]+|[,;:]+$/g, '')
        .trim(),
    )
    .filter(Boolean);
}

const EXTRA_COUNTRIES = [
  'France',
  'Spain',
  'Italy',
  'Japan',
  'Singapore',
  'Brazil',
  'Ireland',
  'Israel',
  'Sweden',
  'Switzerland',
  'Poland',
  'Portugal',
  'Norway',
  'Denmark',
  'Finland',
  'Belgium',
  'Austria',
  'New Zealand',
  'Nigeria',
  'Kenya',
  'South Africa',
  'Philippines',
  'Indonesia',
  'Malaysia',
  'Thailand',
  'Pakistan',
  'Bangladesh',
  'Argentina',
  'Chile',
  'Colombia',
  'Peru',
  'Egypt',
  'Turkey',
  'Greece',
  'Czech Republic',
  'Romania',
  'Ukraine',
];

function isCountry(s: string): boolean {
  const n = normalize(s);
  return countryCandidates(s).length > 1 || EXTRA_COUNTRIES.some((c) => normalize(c) === n);
}

const CITY = String.raw`[A-Z][A-Za-z.'\- ]*[a-z.]`;

export interface Place {
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/** "Austin, TX 78701" · "Austin, Texas" · "London, UK" · "Remote" → Place. */
export function parsePlace(text: string): Place | null {
  const s = text.trim();
  if (/^remote\b/i.test(s)) return { city: 'Remote', state: '', postalCode: '', country: '' };
  let m = s.match(new RegExp(`^(${CITY}),\\s*([A-Z]{2})(?:\\s+(\\d{5}(?:-\\d{4})?))?$`));
  if (m && stateForms(m[2]!))
    return { city: m[1]!.trim(), state: m[2]!, postalCode: m[3] ?? '', country: 'United States' };
  m = s.match(new RegExp(`^(${CITY}),\\s*([A-Z][A-Za-z. ]+?)(?:\\s+(\\d{5}))?$`));
  if (m) {
    if (stateForms(m[2]!))
      return {
        city: m[1]!.trim(),
        state: m[2]!.trim(),
        postalCode: m[3] ?? '',
        country: 'United States',
      };
    if (isCountry(m[2]!)) {
      return { city: m[1]!.trim(), state: '', postalCode: '', country: canonicalCountry(m[2]!) };
    }
  }
  return null;
}

const isLocation = (s: string): boolean => parsePlace(s) !== null;

/** "Acme Inc, San Francisco, CA" → ["Acme Inc", "San Francisco, CA"]. */
function splitTrailingLocation(part: string): [string, string] | null {
  const pieces = part.split(/,\s*/);
  for (let k = 1; k < pieces.length; k++) {
    const tail = pieces.slice(k).join(', ');
    if (isLocation(tail)) return [pieces.slice(0, k).join(', '), tail];
  }
  return null;
}

const TITLE_WORDS =
  /\b(engineer|developer|programmer|manager|analyst|intern|internship|designer|scientist|consultant|director|lead|specialist|associate|coordinator|administrator|architect|officer|assistant|representative|technician|researcher|president|head|vp|founder|co-founder|cofounder|owner|teacher|tutor|instructor|professor|nurse|accountant|advisor|adviser|strategist|writer|editor|producer|recruiter|attorney|counsel|fellow|trainee|apprentice|supervisor|executive|partner|principal|clerk|agent|operator|volunteer|sde|swe|cto|ceo|cfo|coo)\b/i;
const COMPANY_WORDS =
  /\b(inc|llc|ltd|limited|corp|corporation|company|co|technologies|technology|labs?|group|systems|solutions|university|college|institute|bank|partners|holdings|studios?|agency|foundation|hospital|capital|ventures|gmbh|plc|ag|bv|pty|consulting|networks|industries|enterprises|services|analytics)\b/i;

// ── Contact block ────────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE =
  /(\+\d{1,3})?[\s.-]?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b|(\+\d{1,3})((?:[\s.-]?\d{2,5}){2,5})/;
const URL_RE =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|dev|io|me|net|org|co|ai|app|xyz|site|page|tech|design|us|uk|ca|info|blog|portfolio)(?:\/[^\s|,;)]*)?/gi;

function toUrl(raw: string): string {
  const s = raw
    .trim()
    .replace(/[.,;)]+$/, '')
    .replace(/\/$/, '');
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

const NAME_TOKEN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*$/;
const NAME_STOP = /\b(resume|curriculum|vitae|cv|page|email|phone|linkedin|github|portfolio)\b/i;
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

function parseName(line: string): { first: string; middle: string; last: string } | null {
  const candidate = splitParts(line)[0]?.split(',')[0]?.replace(EMAIL_RE, '').trim() ?? '';
  if (!candidate || NAME_STOP.test(candidate) || sectionOf(candidate)) return null;
  let tokens = candidate.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5 || !tokens.every((t) => NAME_TOKEN.test(t)))
    return null;
  tokens = tokens.filter((t) => !SUFFIXES.has(t.toLowerCase().replace(/\./g, '')));
  if (tokens.length < 2 || tokens.length > 4) return null;
  const words = tokens.map(titleCase);
  return { first: words[0]!, middle: words.slice(1, -1).join(' '), last: words[words.length - 1]! };
}

const STREET_RE =
  /^\d+\s+[A-Za-z0-9 .'-]+?\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|ter|terrace|cir|circle|hwy|highway|sq|square)\b\.?(?:\s*(?:apt|unit|suite|#)\s*\w+)?/i;

/** "tel:+18582528304" → +1 / "(858) 252-8304" when no phone was found in the text. */
function applyTelLink(data: ResumeData, raw: string): void {
  if (data.personal.phone) return;
  const compact = raw.replace(/[^\d+]/g, '');
  const us = compact.match(/^(?:\+?1)?(\d{3})(\d{3})(\d{4})$/);
  if (us) {
    data.personal.phoneCountryCode = compact.startsWith('+') ? '+1' : '';
    data.personal.phone = `(${us[1]}) ${us[2]}-${us[3]}`;
  } else if (compact.replace('+', '').length >= 7) {
    data.personal.phone = compact;
  }
}

function parseContact(header: string[], all: string[], links: string[], data: ResumeData): void {
  const text = all.join('\n');
  const email = text.match(EMAIL_RE);
  if (email) data.personal.email = email[0];

  const headerText = header.join('\n');
  const phone = (headerText.match(PHONE_RE) ?? text.match(PHONE_RE)) as RegExpMatchArray | null;
  if (phone) {
    if (phone[2]) {
      data.personal.phone = phone[2].trim();
      data.personal.phoneCountryCode = phone[1] ?? '';
    } else if (phone[3]) {
      data.personal.phoneCountryCode = phone[3];
      data.personal.phone = phone[4]!.trim();
    }
  }

  for (const line of header.slice(0, 4)) {
    const name = parseName(line);
    if (name) {
      data.personal.firstName = name.first;
      data.personal.middleName = name.middle;
      data.personal.lastName = name.last;
      break;
    }
  }

  outer: for (const line of header) {
    for (const part of splitParts(line)) {
      const clean = part.replace(EMAIL_RE, '').replace(PHONE_RE, '').trim();
      const full = clean.match(/^(\d+[^,]+),\s*(.+)$/);
      if (full && STREET_RE.test(full[1]!) && isLocation(full[2]!)) {
        data.address.line1 = full[1]!.trim();
        Object.assign(data.address, parsePlace(full[2]!));
        break outer;
      }
      if (STREET_RE.test(clean) && !data.address.line1) data.address.line1 = clean;
      const place = parsePlace(clean);
      if (place && place.city !== 'Remote') {
        Object.assign(data.address, place);
        break outer;
      }
    }
  }

  // Hyperlink targets can use any scheme. Only web links become profile links;
  // tel:/mailto: targets (clickable phone/email) are fallbacks when the text lacked them.
  const webLinks: string[] = [];
  for (const raw of links) {
    const link = raw.trim();
    const scheme = link.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme === 'mailto') {
      data.personal.email ||= decodeURIComponent(link.slice(7).split('?')[0]!);
    } else if (scheme === 'tel') {
      applyTelLink(data, decodeURIComponent(link.slice(4)));
    } else if (!scheme || scheme === 'http' || scheme === 'https') {
      webLinks.push(link);
    }
  }
  const urls = [...webLinks, ...(text.match(URL_RE) ?? [])]
    .filter((u) => !u.includes('@'))
    .map(toUrl);
  const seen = new Set<string>();
  for (const url of urls) {
    const key = url
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    if (/linkedin\.com\/(in|pub)\//i.test(url)) data.links.linkedin ||= url.replace(/\/$/, '');
    else if (/github\.com\/[\w-]+/i.test(url)) data.links.github ||= url.replace(/\/$/, '');
    else if (/(twitter|x)\.com\/[\w]+/i.test(url)) data.links.twitter ||= url;
    else if (email && key.endsWith(email[0].split('@')[1]!.toLowerCase())) continue;
    else if (!data.links.portfolio) data.links.portfolio = url;
    else data.links.other ||= url;
  }
}

// ── Experience ───────────────────────────────────────────────────────────────

function isHeaderLike(line: string): boolean {
  if (isBullet(line)) return false;
  const t = line.replace(RANGE_RE, '').trim();
  if (!t) return true;
  if (t.length > 90 || /^[a-z]/.test(t)) return false;
  const words = t.split(/\s+/).length;
  if (/[.!?;]$/.test(t) && words > 6) return false;
  return words <= 12;
}

function assignRoles(parts: string[]): { title: string; company: string; location: string } {
  let location = '';
  const rest: string[] = [];
  for (const raw of parts) {
    if (!location && isLocation(raw)) {
      location = parsePlace(raw)!.city === 'Remote' ? 'Remote' : raw;
      continue;
    }
    const split = splitTrailingLocation(raw);
    if (split && !location) {
      location = split[1];
      rest.push(split[0]);
    } else {
      rest.push(...raw.split(/\s+at\s+(?=[A-Z])/));
    }
  }
  let title = rest.find((p) => TITLE_WORDS.test(p)) ?? '';
  let company = rest.find((p) => p !== title && COMPANY_WORDS.test(p)) ?? '';
  const unassigned = rest.filter((p) => p !== title && p !== company);
  if (!title) title = unassigned.shift() ?? '';
  if (!company) company = unassigned.shift() ?? '';
  return { title, company, location };
}

export function parseWork(lines: string[]): ResumeWork[] {
  const dateIdx = lines.map((l, i) => (RANGE_RE.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!dateIdx.length) return [];
  const first = dateIdx[0]!;
  // Layout: dates on the first line of each entry ("Title   Jan 2020 – Present")
  // or after a heading line ("Acme Inc" / "Engineer, Jan 2020 – Present").
  const before = first > 0 && isHeaderLike(lines[first - 1]!) && !isBullet(lines[first - 1]!);

  const starts = dateIdx.map((i, k) => {
    let start = i;
    if (before) {
      const floor = k ? dateIdx[k - 1]! : -1;
      while (start - 1 > floor && i - start < 2 && isHeaderLike(lines[start - 1]!)) start--;
    }
    return start;
  });
  // Pre-date heading lines can't also belong to the previous entry's header.
  const ends = dateIdx.map((i, k) => {
    const limit = starts[k + 1] ?? lines.length;
    let end = i;
    while (
      end + 1 < limit &&
      end - i < 2 &&
      isHeaderLike(lines[end + 1]!) &&
      !RANGE_RE.test(lines[end + 1]!)
    )
      end++;
    return end;
  });

  return dateIdx.map((i, k) => {
    const headerLines = lines.slice(starts[k], ends[k]! + 1);
    const range = findRange(lines[i]!)!;
    const parts = headerLines.flatMap((l) => splitParts(removeDates(l.replace(RANGE_RE, ' '))));
    const { title, company, location } = assignRoles(parts);
    const descLines = lines.slice(ends[k]! + 1, starts[k + 1] ?? lines.length);
    const description = descLines
      .reduce<string[]>((acc, line) => {
        const text = stripBullet(line);
        if (!text) return acc;
        // Wrapped continuation of the previous bullet.
        if (acc.length && !isBullet(line) && /^[a-z(]/.test(text))
          acc[acc.length - 1] += ` ${text}`;
        else acc.push(text);
        return acc;
      }, [])
      .map((l) => `• ${l}`)
      .join('\n');
    return {
      title,
      company,
      location,
      startDate: range.start,
      endDate: range.end,
      current: range.current,
      description,
    };
  });
}

// ── Education ────────────────────────────────────────────────────────────────

const SCHOOL_RE =
  /\b(university|college|institute|school|academy|polytechnic|conservatory|universidad|université|universität)\b/i;
const LONG_DEGREE_RE =
  /\b(?:bachelor|master|doctor|associate)(?:'s|’s|s)?(?:\s+degree)?(?:\s+of\s+(?:[A-Z][a-z]+)(?:\s+(?:[A-Z][a-z]+|and|in))*)?|\bhigh school diploma\b|\bGED\b/i;
const ABBR_DEGREE_RE =
  /(?:^|[\s,(])(Ph\.?\s?D\.?|M\.B\.A\.?|MBA|B\.S\.?c?\.?|BSc|BS|B\.A\.?|BA|B\.Eng\.?|BEng|B\.Tech\.?|BTech|M\.S\.?c?\.?|MSc|MS|M\.A\.|MA|M\.Eng\.?|MEng|J\.D\.|JD|M\.D\.|MD|A\.A\.|AA|A\.S\.|AS)(?=$|[\s,.:;)])/;
const ABBR_NAMES: Array<[RegExp, string]> = [
  [/^ph\.?\s?d/i, 'PhD'],
  [/^m\.?b\.?a/i, 'MBA'],
  [/^b\.?sc?\.?$/i, 'Bachelor of Science'],
  [/^b\.?a\.?$/i, 'Bachelor of Arts'],
  [/^b\.?eng/i, 'Bachelor of Engineering'],
  [/^b\.?tech/i, 'Bachelor of Technology'],
  [/^m\.?sc?\.?$/i, 'Master of Science'],
  [/^m\.?a\.?$/i, 'Master of Arts'],
  [/^m\.?eng/i, 'Master of Engineering'],
  [/^j\.?d\.?$/i, 'JD'],
  [/^m\.?d\.?$/i, 'MD'],
  [/^a\.?a\.?$/i, 'Associate of Arts'],
  [/^a\.?s\.?$/i, 'Associate of Science'],
];
const GPA_RE =
  /\bGPA\b\s*[:-]?\s*([0-4]\.\d{1,2})|([0-4]\.\d{1,2})\s*(?:\/\s*4(?:\.0+)?)?\s*GPA\b/i;

function findDegree(text: string): { degree: string; rest: string } | null {
  const long = text.match(LONG_DEGREE_RE);
  if (long) {
    let degree = long[0].trim();
    // "Bachelor of Science in Computer Science": the field follows "in".
    const inField = degree.match(/^(.*?)\s+in\s+(.+)$/i);
    let rest = text.slice((long.index ?? 0) + long[0].length);
    if (inField) {
      degree = inField[1]!;
      rest = ` in ${inField[2]}${rest}`;
    }
    return { degree: degree.replace(/\s+degree$/i, "'s Degree").replace(/'s's/, "'s"), rest };
  }
  const abbr = text.match(ABBR_DEGREE_RE);
  if (abbr) {
    const token = abbr[1]!;
    const name = ABBR_NAMES.find(([re]) => re.test(token))?.[1] ?? token;
    return { degree: name, rest: text.slice((abbr.index ?? 0) + abbr[0].length) };
  }
  return null;
}

function fieldFrom(rest: string): string {
  const cleaned = removeDates(rest)
    .replace(GPA_RE, ' ')
    .replace(/^[\s,:\-–—.]*(?:(?:in|of)\s+)?/i, '')
    .split(/[,|\t(;]|\bminor\b|\bwith\b|\bcum laude\b|\bhonou?rs\b|\bconcentration\b/i)[0]!
    .trim();
  return /^[A-Z]/.test(cleaned) && cleaned.split(/\s+/).length <= 6 ? cleaned : '';
}

/**
 * "Master of Science in Computer Science, University of Southern California"
 * (or school first, or "… from Rutgers University") → degree text + school
 * text. Commas inside the school name ("University of California, Berkeley")
 * are kept.
 */
export function splitDegreeAndSchool(text: string): { degree: string; school: string } | null {
  if (!SCHOOL_RE.test(text)) return null;
  const pieces = text.split(/\s*,\s*|\s+(?:at|from)\s+(?=[A-Z])/).filter(Boolean);
  const schoolAt = pieces.findIndex((p) => SCHOOL_RE.test(p));
  if (schoolAt > 0) {
    const degree = pieces.slice(0, schoolAt).join(', ');
    return findDegree(degree) ? { degree, school: pieces.slice(schoolAt).join(', ') } : null;
  }
  const degreeAt = pieces.findIndex((p) => findDegree(p) !== null);
  if (degreeAt <= 0) return null;
  return {
    school: pieces.slice(0, degreeAt).join(', '),
    degree: pieces.slice(degreeAt).join(', '),
  };
}

export function parseEducation(lines: string[]): ResumeEducation[] {
  const schoolIdx = lines
    .map((l, i) => (SCHOOL_RE.test(l) && !isBullet(l) ? i : -1))
    .filter((i) => i >= 0);
  const starts = schoolIdx.length ? schoolIdx.map((i, k) => (k === 0 ? 0 : i)) : [0];
  return starts
    .map((start, k) => {
      const block = lines.slice(start, starts[k + 1] ?? lines.length).filter((l) => !isBullet(l));
      const entry: ResumeEducation = {
        school: '',
        degree: '',
        fieldOfStudy: '',
        gpa: '',
        startDate: '',
        endDate: '',
      };
      for (const line of block) {
        const parts = splitParts(removeDates(line.replace(RANGE_RE, ' '))).flatMap((part) => {
          const split = splitTrailingLocation(part);
          const text = split ? split[0] : part;
          const combo = splitDegreeAndSchool(text);
          return combo ? [combo.degree, combo.school] : [text];
        });
        for (const text of parts) {
          if (isLocation(text)) continue;
          if (!entry.school && SCHOOL_RE.test(text) && !/diploma/i.test(text)) {
            entry.school = text
              .replace(GPA_RE, '')
              .replace(/[\s,;|–—-]+$/, '')
              .trim();
            continue;
          }
          if (!entry.degree) {
            const d = findDegree(text);
            if (d) {
              entry.degree = d.degree;
              entry.fieldOfStudy = fieldFrom(d.rest);
              continue;
            }
          }
          const major = text.match(/^(?:major|field of study|concentration)\s*[:-]\s*(.+)$/i);
          if (major && !entry.fieldOfStudy) entry.fieldOfStudy = major[1]!.trim();
        }
        const gpa = line.match(GPA_RE);
        if (gpa && !entry.gpa) entry.gpa = gpa[1] ?? gpa[2] ?? '';
        const range = findRange(line);
        if (range) {
          entry.startDate ||= range.start;
          entry.endDate ||= range.end;
        } else if (!entry.endDate) {
          const singles = [...line.matchAll(SINGLE_RE)]
            .map((m) => toYearMonth(m[1]!))
            .filter(Boolean);
          if (singles.length) entry.endDate = singles[singles.length - 1]!;
        }
      }
      return entry;
    })
    .filter((e) => e.school || e.degree);
}

// ── Skills & text sections ───────────────────────────────────────────────────

function parseList(lines: string[]): string {
  const items: string[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    const body = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
    for (const item of body.split(/[,;|•·\t]/)) {
      const t = item.trim().replace(/\.$/, '');
      if (t && t.length <= 60 && !items.some((x) => normalize(x) === normalize(t))) items.push(t);
    }
  }
  return items.join(', ');
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function emptyResumeData(): ResumeData {
  return {
    personal: {
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      phone: '',
      phoneCountryCode: '',
    },
    address: { line1: '', city: '', state: '', postalCode: '', country: '' },
    links: { linkedin: '', github: '', portfolio: '', twitter: '', other: '' },
    work: [],
    education: [],
    skills: '',
    languages: '',
    summary: '',
  };
}

export function parseResume(input: ExtractedText): ResumeData {
  const lines = input.lines
    .flatMap((l) => l.split('\n'))
    .map(cleanLine)
    .filter(Boolean);
  const data = emptyResumeData();

  const sections: Record<SectionName, string[]> = {
    summary: [],
    work: [],
    education: [],
    skills: [],
    languages: [],
    other: [],
  };
  const header: string[] = [];
  let current: SectionName | null = null;
  for (const line of lines) {
    const heading = sectionOf(line);
    if (heading) {
      current = heading;
      continue;
    }
    if (current) sections[current].push(line);
    else header.push(line);
  }

  parseContact(header.length ? header : lines.slice(0, 5), lines, input.links, data);
  data.summary = sections.summary.map(stripBullet).join(' ').trim();
  data.work = parseWork(sections.work);
  data.education = parseEducation(sections.education);
  data.skills = parseList(sections.skills);
  data.languages = parseList(sections.languages);
  return data;
}

/** True when two free-text values mean the same thing (used to avoid pointless prompts). */
export function sameText(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || (na.length > 20 && tokenDice(na, nb) > 0.92);
}
