import type { ControlKind } from '../shared/report';

export type { ControlKind };

export type SectionKind = 'work' | 'education' | 'eeo' | 'none';

export interface SectionInfo {
  kind: SectionKind;
  /** Normalized heading or container identifier text. */
  text: string;
  /** Zero-based entry index when the heading is numbered ("Work Experience 2"). */
  index?: number;
}

export interface FieldOption {
  label: string;
  value: string;
  el: HTMLElement;
}

/** A form control (or radio/checkbox group) discovered on the page. */
export interface ScannedField {
  el: HTMLElement;
  /** All member elements; a single element except for radio/checkbox groups. */
  inputs: HTMLElement[];
  kind: ControlKind;
  inputType: string;
  /** Human-readable label shown in reports. */
  label: string;
  /** Normalized label used for classification. */
  labelNorm: string;
  /** Normalized placeholder, aria-describedby text and title. */
  hint: string;
  /** Normalized identifier tokens from name/id/data-* attributes. */
  attrs: string;
  autocomplete: string;
  section: SectionInfo;
  options: FieldOption[];
  required: boolean;
  multiple: boolean;
  readOnly: boolean;
}

export const FIELD_TYPES = [
  'firstName',
  'middleName',
  'lastName',
  'fullName',
  'preferredName',
  'email',
  'phone',
  'phoneCountryCode',
  'phoneType',
  'address1',
  'address2',
  'city',
  'state',
  'postalCode',
  'country',
  'location',
  'linkedin',
  'github',
  'portfolio',
  'twitter',
  'otherUrl',
  'resume',
  'coverLetter',
  'work.company',
  'work.title',
  'work.location',
  'work.start',
  'work.end',
  'work.current',
  'work.description',
  'edu.school',
  'edu.degree',
  'edu.field',
  'edu.gpa',
  'edu.start',
  'edu.end',
  'yearsExperience',
  'workAuthorization',
  'sponsorship',
  'relocate',
  'over18',
  'preferredLocations',
  'workArrangement',
  'salary',
  'noticePeriod',
  'availableStart',
  'howHeard',
  'clearance',
  'citizenship',
  'skills',
  'languages',
  'summary',
  'gender',
  'pronouns',
  'race',
  'hispanic',
  'veteran',
  'disability',
  'sexualOrientation',
  'transgender',
  'custom',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const EEO_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'gender',
  'pronouns',
  'race',
  'hispanic',
  'veteran',
  'disability',
  'sexualOrientation',
  'transgender',
]);

export type MatchSource = 'hint' | 'autocomplete' | 'label' | 'attr' | 'placeholder' | 'custom';

export interface Classification {
  type: FieldType;
  score: number;
  source: MatchSource;
  /** Entry index for work/education fields (0 = most recent). */
  index: number;
  /** Id of the matching custom answer when type is `custom`. */
  customId?: string;
}

export interface ClassifiedField extends ScannedField {
  classification: Classification | null;
}
