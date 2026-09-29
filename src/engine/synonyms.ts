/**
 * Vocabulary used to translate profile values into the many ways application
 * forms phrase the same choice. Candidates are ordered most-specific first.
 */
import type {
  DisabilityStatus,
  Gender,
  HispanicLatino,
  Race,
  SexualOrientation,
  TransgenderStatus,
  VeteranStatus,
  WorkArrangement,
} from '../shared/types';
import { normalize } from './text';

export const YES = ['Yes', 'Y', 'True'];
export const NO = ['No', 'N', 'False'];

export const DECLINE = [
  'I do not want to answer',
  "I don't wish to answer",
  'I do not wish to answer',
  'Decline to self identify',
  'Decline to self-identify',
  'Decline to state',
  'Decline to answer',
  'Prefer not to say',
  'Prefer not to answer',
  'Prefer not to disclose',
  'I choose not to disclose',
  'Choose not to disclose',
  'I prefer not to answer',
  'I do not wish to self-identify',
  'I decline to self-identify',
  'Not Declared',
  'Not specified',
  'Decline',
];

export const GENDER: Record<Exclude<Gender, ''>, string[]> = {
  male: ['Male', 'Man', 'Cisgender man', 'M'],
  female: ['Female', 'Woman', 'Cisgender woman', 'F'],
  nonbinary: [
    'Non-binary',
    'Nonbinary',
    'Non binary',
    'Genderqueer',
    'Gender non-conforming',
    'Another gender identity',
  ],
  decline: DECLINE,
};

export const RACE: Record<Race, string[]> = {
  asian: [
    'Asian',
    'Asian (Not Hispanic or Latino)',
    'Asian American',
    'East Asian',
    'South Asian',
    'Southeast Asian',
  ],
  black: [
    'Black or African American',
    'Black or African American (Not Hispanic or Latino)',
    'Black',
    'African American',
  ],
  hispanic: [
    'Hispanic or Latino',
    'Hispanic/Latino',
    'Hispanic',
    'Latino',
    'Latinx',
    'Latina',
    'Latine',
  ],
  white: ['White', 'White (Not Hispanic or Latino)', 'Caucasian'],
  native_american: [
    'American Indian or Alaska Native',
    'American Indian or Alaskan Native',
    'Native American',
    'Alaska Native',
    'Indigenous',
  ],
  pacific_islander: [
    'Native Hawaiian or Other Pacific Islander',
    'Native Hawaiian or Pacific Islander',
    'Pacific Islander',
    'Native Hawaiian',
  ],
  middle_eastern: ['Middle Eastern or North African', 'Middle Eastern', 'North African', 'MENA'],
  two_or_more: [
    'Two or More Races',
    'Two or more races (Not Hispanic or Latino)',
    'Two or more',
    'Multiracial',
    'Mixed race',
    'Multiple',
  ],
  decline: DECLINE,
};

export const HISPANIC: Record<Exclude<HispanicLatino, ''>, string[]> = {
  yes: ['Yes', 'Hispanic or Latino', 'Hispanic', 'Latino'],
  no: ['No', 'Not Hispanic or Latino', 'Not Hispanic'],
  decline: DECLINE,
};

export const VETERAN: Record<Exclude<VeteranStatus, ''>, string[]> = {
  not_veteran: [
    'I am not a protected veteran',
    'I am not a veteran',
    'Not a protected veteran',
    'Not a veteran',
    'I am not a Veteran or active member',
    'No',
  ],
  protected_veteran: [
    'I identify as one or more of the classifications of protected veteran',
    'I identify as one or more of the classifications of protected veterans',
    'I am a protected veteran',
    'Protected veteran',
    'Yes',
  ],
  veteran: ['I am a veteran but not a protected veteran', 'I am a veteran', 'Veteran', 'Yes'],
  decline: [...DECLINE, "I don't wish to answer"],
};

export const DISABILITY: Record<Exclude<DisabilityStatus, ''>, string[]> = {
  yes: [
    'Yes, I have a disability, or have had one in the past',
    'Yes, I have a disability (or previously had a disability)',
    'Yes, I have a disability',
    'Yes',
  ],
  no: [
    'No, I do not have a disability and have not had one in the past',
    "No, I don't have a disability",
    'No, I do not have a disability',
    'No',
  ],
  decline: ['I do not want to answer', "I don't wish to answer", ...DECLINE],
};

export const ORIENTATION: Record<Exclude<SexualOrientation, ''>, string[]> = {
  heterosexual: ['Heterosexual', 'Straight', 'Heterosexual or straight'],
  gay: ['Gay', 'Gay or lesbian', 'Homosexual'],
  lesbian: ['Lesbian', 'Gay or lesbian'],
  bisexual: ['Bisexual', 'Bisexual and/or pansexual', 'Pansexual'],
  asexual: ['Asexual'],
  queer: ['Queer'],
  decline: DECLINE,
};

export const TRANSGENDER: Record<Exclude<TransgenderStatus, ''>, string[]> = {
  yes: ['Yes'],
  no: ['No'],
  decline: DECLINE,
};

export const ARRANGEMENT: Record<WorkArrangement, string[]> = {
  remote: ['Remote', 'Fully remote', 'Remote only', 'Work from home', 'WFH'],
  hybrid: ['Hybrid', 'Hybrid (remote and office)', 'Flexible'],
  onsite: [
    'On-site',
    'Onsite',
    'On site',
    'In office',
    'In-office',
    'In person',
    'In-person',
    'Office',
  ],
};

export const PHONE_TYPE = ['Mobile', 'Cell', 'Mobile Phone', 'Cell Phone', 'Personal', 'Home'];

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthCandidates(month: number): string[] {
  const name = MONTHS[month - 1];
  if (!name) return [];
  const mm = String(month).padStart(2, '0');
  return [name, name.slice(0, 3), mm, String(month)];
}

export const US_STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  PR: 'Puerto Rico',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

/** Returns [full name, abbreviation] for a US state given either form. */
export function stateForms(state: string): { full: string; abbr: string } | null {
  const s = state.trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (US_STATES[upper]) return { full: US_STATES[upper]!, abbr: upper };
  const n = normalize(s);
  for (const [abbr, full] of Object.entries(US_STATES)) {
    if (normalize(full) === n) return { full, abbr };
  }
  return null;
}

const COUNTRY_ALIASES: string[][] = [
  ['United States', 'United States of America', 'USA', 'US', 'U.S.', 'U.S.A.', 'America'],
  ['United Kingdom', 'UK', 'U.K.', 'Great Britain', 'England', 'Britain'],
  ['Canada', 'CA', 'CAN'],
  ['India', 'IN', 'IND'],
  ['Germany', 'Deutschland', 'DE'],
  ['China', "People's Republic of China", 'PRC', 'CN'],
  ['South Korea', 'Korea, Republic of', 'Republic of Korea', 'Korea'],
  ['Netherlands', 'The Netherlands', 'Holland'],
  ['United Arab Emirates', 'UAE'],
  ['Australia', 'AU', 'AUS'],
  ['Mexico', 'MX', 'MEX'],
  ['Taiwan', 'Taiwan, Province of China', 'TW'],
  ['Hong Kong', 'Hong Kong SAR', 'HK'],
  ['Vietnam', 'Viet Nam'],
  ['Russia', 'Russian Federation'],
];

export function countryCandidates(country: string): string[] {
  const n = normalize(country);
  if (!n) return [];
  const group = COUNTRY_ALIASES.find((g) => g.some((alias) => normalize(alias) === n));
  return group ? [country, ...group.filter((a) => a !== country)] : [country];
}

export function isUnitedStates(country: string): boolean {
  return countryCandidates(country).includes('United States');
}

type DegreeLevel = 'highschool' | 'associate' | 'bachelor' | 'master' | 'mba' | 'phd' | 'jd' | 'md';

const DEGREE_PATTERNS: Array<[DegreeLevel, RegExp]> = [
  ['mba', /\bmba\b|business administration/],
  ['md', /\bm\s*d\b|doctor of medicine/],
  ['jd', /\bj\s*d\b|juris doctor/],
  ['phd', /\bph\s*d\b|doctor(ate|al)?\b|\bdphil\b/],
  ['master', /\bmaster|\bm\s*s\b|\bm\s*a\b|\bm\s*sc\b|\bm\s*eng\b|\bmeng\b|\bmsc\b/],
  [
    'bachelor',
    /\bbachelor|\bb\s*s\b|\bb\s*a\b|\bb\s*sc\b|\bb\s*eng\b|\bbeng\b|\bbsc\b|\bb\s*tech\b|undergrad/,
  ],
  ['associate', /\bassociate|\ba\s*a\b|\ba\s*s\b/],
  ['highschool', /high\s*school|\bged\b|secondary|diploma/],
];

const DEGREE_CANDIDATES: Record<DegreeLevel, string[]> = {
  highschool: [
    'High School Diploma',
    'High School',
    'High School or equivalent',
    'GED',
    'Secondary School',
  ],
  associate: ["Associate's Degree", 'Associate Degree', "Associate's", 'Associate'],
  bachelor: [
    "Bachelor's Degree",
    'Bachelor Degree',
    "Bachelor's",
    'Bachelors',
    'Bachelor of Science',
    'Bachelor of Arts',
    'BS',
    'BA',
    'Undergraduate',
  ],
  master: [
    "Master's Degree",
    'Master Degree',
    "Master's",
    'Masters',
    'Master of Science',
    'Master of Arts',
    'MS',
    'MA',
    'Graduate',
  ],
  mba: ['MBA', 'Master of Business Administration', "Master's Degree", "Master's"],
  phd: ['Doctorate', 'Ph.D.', 'PhD', 'Doctor of Philosophy', 'Doctoral Degree', 'Doctorate Degree'],
  jd: ['Juris Doctor', 'J.D.', 'JD', 'Doctorate', 'Law Degree'],
  md: ['Doctor of Medicine', 'M.D.', 'MD', 'Doctorate', 'Medical Degree'],
};

export function degreeCandidates(degree: string): string[] {
  const n = normalize(degree);
  if (!n) return [];
  const level = DEGREE_PATTERNS.find(([, re]) => re.test(n))?.[0];
  return level ? [degree, ...DEGREE_CANDIDATES[level]] : [degree];
}

const HEAR_ABOUT: Array<[RegExp, string[]]> = [
  [/linked\s*in/, ['LinkedIn', 'Social Media', 'Social Network', 'Job Board', 'Online Job Board']],
  [
    /indeed|glassdoor|zip\s*recruiter|monster|dice|handshake|job\s*board/,
    ['Job Board', 'Online Job Board', 'Job Site'],
  ],
  [
    /referr|friend|employee/,
    ['Referral', 'Employee Referral', 'Friend', 'Referred by an employee'],
  ],
  [
    /company\s*(web)?site|careers?\s*(page|site)/,
    ['Company Website', 'Careers Page', 'Company Careers Site', 'Website'],
  ],
  [/recruiter|agency/, ['Recruiter', 'Recruiter Outreach', 'Agency']],
  [/twitter|facebook|instagram|social/, ['Social Media']],
  [
    /career\s*fair|event|conference|university|school|campus/,
    ['Career Fair', 'University', 'Event', 'Campus Recruiting'],
  ],
];

export function hearAboutCandidates(value: string): string[] {
  const n = normalize(value);
  if (!n) return [];
  const extra = HEAR_ABOUT.filter(([re]) => re.test(n)).flatMap(([, list]) => list);
  return [value, ...extra];
}
