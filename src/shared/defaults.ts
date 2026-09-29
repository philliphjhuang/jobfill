import type {
  CustomAnswer,
  Documents,
  Education,
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

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  floatingButton: 'auto',
  overwriteExisting: false,
  uploadResume: true,
  uploadCoverLetter: true,
  fillEeo: true,
  addMissingEntries: true,
  highlightFields: true,
  keepHistory: true,
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

export function normalizeSettings(raw: unknown): Settings {
  return mergeWithDefaults<Settings>({ ...DEFAULT_SETTINGS }, raw);
}
