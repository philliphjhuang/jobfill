/**
 * Core data model. Everything here is persisted in chrome.storage.local and
 * never leaves the user's machine.
 */

/** A yes/no answer the user may leave unset. */
export type YesNo = 'yes' | 'no' | '';

export interface StoredFile {
  name: string;
  type: string;
  size: number;
  /** Base64 payload without the `data:` prefix. */
  data: string;
  updatedAt: string;
}

export interface Personal {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  email: string;
  /** National number, e.g. "(415) 555-0100". */
  phone: string;
  /** Dialing prefix, e.g. "+1". */
  phoneCountryCode: string;
}

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Links {
  linkedin: string;
  github: string;
  portfolio: string;
  twitter: string;
  other: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  location: string;
  /** YYYY-MM */
  startDate: string;
  /** YYYY-MM, empty when `current` is true. */
  endDate: string;
  current: boolean;
  description: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  fieldOfStudy: string;
  gpa: string;
  /** YYYY-MM */
  startDate: string;
  /** YYYY-MM (graduation or expected graduation). */
  endDate: string;
}

export type WorkArrangement = 'remote' | 'hybrid' | 'onsite';

export interface Preferences {
  preferredLocations: string[];
  workArrangements: WorkArrangement[];
  willingToRelocate: YesNo;
  authorizedToWork: YesNo;
  requiresSponsorship: YesNo;
  over18: YesNo;
  yearsOfExperience: string;
  desiredSalary: string;
  noticePeriod: string;
  /** YYYY-MM-DD */
  earliestStartDate: string;
  /** Free-text availability, e.g. "Immediately" or "2 weeks notice". */
  availability: string;
  howDidYouHear: string;
  securityClearance: string;
  citizenship: string;
}

export type Gender = '' | 'male' | 'female' | 'nonbinary' | 'decline';
export type Race =
  | 'asian'
  | 'black'
  | 'hispanic'
  | 'white'
  | 'native_american'
  | 'pacific_islander'
  | 'middle_eastern'
  | 'two_or_more'
  | 'decline';
export type HispanicLatino = '' | 'yes' | 'no' | 'decline';
export type VeteranStatus = '' | 'not_veteran' | 'protected_veteran' | 'veteran' | 'decline';
export type DisabilityStatus = '' | 'yes' | 'no' | 'decline';
export type SexualOrientation =
  '' | 'heterosexual' | 'gay' | 'lesbian' | 'bisexual' | 'asexual' | 'queer' | 'decline';
export type TransgenderStatus = '' | 'yes' | 'no' | 'decline';

/** Voluntary self-identification (EEO) answers. */
export interface Eeo {
  gender: Gender;
  pronouns: string;
  race: Race[];
  hispanicLatino: HispanicLatino;
  veteran: VeteranStatus;
  disability: DisabilityStatus;
  sexualOrientation: SexualOrientation;
  transgender: TransgenderStatus;
}

/** A user-defined answer for questions the built-in rules do not cover. */
export interface CustomAnswer {
  id: string;
  /** Question text or keywords, e.g. "previously worked for". */
  question: string;
  answer: string;
}

export interface Profile {
  schemaVersion: 1;
  personal: Personal;
  address: Address;
  links: Links;
  work: WorkExperience[];
  education: Education[];
  skills: string;
  languages: string;
  summary: string;
  coverLetter: string;
  preferences: Preferences;
  eeo: Eeo;
  customAnswers: CustomAnswer[];
  updatedAt: string;
}

export interface Documents {
  resume: StoredFile | null;
  coverLetter: StoredFile | null;
}

export type FloatingButtonMode = 'auto' | 'always' | 'never';

export interface Settings {
  floatingButton: FloatingButtonMode;
  /** Replace values that are already present on the page. */
  overwriteExisting: boolean;
  uploadResume: boolean;
  uploadCoverLetter: boolean;
  fillEeo: boolean;
  /** Click "Add another" buttons so every work/education entry gets a slot. */
  addMissingEntries: boolean;
  highlightFields: boolean;
  keepHistory: boolean;
}

export interface HistoryEntry {
  id: string;
  at: string;
  url: string;
  host: string;
  title: string;
  ats: string | null;
  filled: number;
  requiredMissing: number;
  optionalMissing: number;
}

export interface StoredData {
  profile: Profile;
  settings: Settings;
  documents: Documents;
}
