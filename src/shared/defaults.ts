import type {
  CustomAnswer,
  Documents,
  Education,
  PacingSettings,
  Profile,
  Settings,
  WorkExperience,
} from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWorkExperience(): WorkExperience {
  return {
    id: newId(),
    company: '',
    title: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    description: '',
  };
}

export function createEducation(): Education {
  return {
    id: newId(),
    school: '',
    degree: '',
    fieldOfStudy: '',
    gpa: '',
    startDate: '',
    endDate: '',
  };
}

export function createCustomAnswer(): CustomAnswer {
  return { id: newId(), question: '', answer: '' };
}

export function createEmptyProfile(): Profile {
  return {
    schemaVersion: 1,
    personal: {
      firstName: '',
      middleName: '',
      lastName: '',
      preferredName: '',
      email: '',
      phone: '',
      phoneCountryCode: '+1',
    },
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'United States',
    },
    links: { linkedin: '', github: '', portfolio: '', twitter: '', other: '' },
    work: [],
    education: [],
    skills: '',
    languages: '',
    summary: '',
    coverLetter: '',
    preferences: {
      preferredLocations: [],
      workArrangements: [],
      willingToRelocate: '',
      authorizedToWork: '',
      requiresSponsorship: '',
      over18: '',
      yearsOfExperience: '',
      desiredSalary: '',
      noticePeriod: '',
      earliestStartDate: '',
      availability: '',
      howDidYouHear: '',
      securityClearance: '',
      citizenship: '',
    },
    eeo: {
      gender: '',
      pronouns: '',
      race: [],
      hispanicLatino: '',
      veteran: '',
      disability: '',
      sexualOrientation: '',
      transgender: '',
    },
    customAnswers: [],
    updatedAt: '',
  };
}

export const DEFAULT_PACING: Readonly<PacingSettings> = Object.freeze({
  enabled: true,
  keyMinSec: 0.1,
  keyMaxSec: 0.9,
  fieldMinSec: 3,
  fieldMaxSec: 7,
});

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  floatingButton: 'auto',
  overwriteExisting: false,
  uploadResume: true,
  uploadCoverLetter: true,
  fillEeo: true,
  addMissingEntries: true,
  highlightFields: true,
  keepHistory: true,
  pacing: DEFAULT_PACING,
});

export function createEmptyDocuments(): Documents {
  return { resume: null, coverLetter: null };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Overlay `stored` onto `defaults`, keeping only keys that exist in `defaults`
 * and whose value type matches. Used to migrate data saved by older versions
 * and to sanitize imported JSON.
 */
export function mergeWithDefaults<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) {
    return defaults;
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const [key, def] of Object.entries(defaults)) {
    const value = stored[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(def)) {
      if (Array.isArray(value)) out[key] = value;
    } else if (isPlainObject(def)) {
      out[key] = mergeWithDefaults(def, value);
    } else if (typeof value === typeof def) {
      out[key] = value;
    }
  }
  return out as T;
}

/** Normalize list items so every entry has all fields (older exports may lack some). */
export function normalizeProfile(raw: unknown): Profile {
  const profile = mergeWithDefaults(createEmptyProfile(), raw);
  profile.work = profile.work
    .filter(isPlainObject)
    .map((w) => mergeWithDefaults(createWorkExperience(), w));
  profile.education = profile.education
    .filter(isPlainObject)
    .map((e) => mergeWithDefaults(createEducation(), e));
  profile.customAnswers = profile.customAnswers
    .filter(isPlainObject)
    .map((c) => mergeWithDefaults(createCustomAnswer(), c));
  profile.preferences.preferredLocations = profile.preferences.preferredLocations.filter(
    (s): s is string => typeof s === 'string' && s.trim() !== '',
  );
  profile.eeo.race = profile.eeo.race.filter((r) => typeof r === 'string');
  profile.schemaVersion = 1;
  return profile;
}

const clampSec = (value: number, fallback: number, max: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : fallback;

/** Keep delays finite, non-negative and bounded, with min ≤ max. */
export function normalizePacing(raw: PacingSettings): PacingSettings {
  const keyA = clampSec(raw.keyMinSec, DEFAULT_PACING.keyMinSec, 10);
  const keyB = clampSec(raw.keyMaxSec, DEFAULT_PACING.keyMaxSec, 10);
  const fieldA = clampSec(raw.fieldMinSec, DEFAULT_PACING.fieldMinSec, 120);
  const fieldB = clampSec(raw.fieldMaxSec, DEFAULT_PACING.fieldMaxSec, 120);
  return {
    enabled: raw.enabled,
    keyMinSec: Math.min(keyA, keyB),
    keyMaxSec: Math.max(keyA, keyB),
    fieldMinSec: Math.min(fieldA, fieldB),
    fieldMaxSec: Math.max(fieldA, fieldB),
  };
}

export function normalizeSettings(raw: unknown): Settings {
  // Deep copy: the defaults are frozen and shared, and the editor mutates settings in place.
  const settings = mergeWithDefaults<Settings>(structuredClone(DEFAULT_SETTINGS) as Settings, raw);
  settings.pacing = normalizePacing(settings.pacing);
  return settings;
}
