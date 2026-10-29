/**
 * Declarative description of the profile editor. The renderer in options.ts
 * turns this into form controls bound to `profile.*` / `settings.*` paths.
 */
import { createCustomAnswer, createEducation, createWorkExperience } from '../shared/defaults';

export interface Opt {
  value: string;
  label: string;
}

interface Base {
  /** Dot path, e.g. "profile.personal.firstName" (relative to the item inside lists). */
  path: string;
  label: string;
  help?: string;
  /** Columns out of 6. */
  span?: 2 | 3 | 4 | 6;
}

export type FieldDef =
  | (Base & {
      kind: 'text' | 'email' | 'tel' | 'url' | 'month' | 'date';
      placeholder?: string;
      autocomplete?: string;
      list?: string;
    })
  | (Base & { kind: 'textarea'; placeholder?: string; rows?: number })
  | (Base & { kind: 'select'; options: Opt[] })
  | (Base & { kind: 'checkbox' })
  | (Base & { kind: 'number'; min: number; max: number; step: number; unit?: string })
  | (Base & { kind: 'multicheck'; options: Opt[] })
  | (Base & { kind: 'lines'; placeholder?: string });

export interface ListDef {
  path: string;
  addLabel: string;
  empty: string;
  title: (item: Record<string, unknown>, index: number) => string;
  create: () => object;
  fields: FieldDef[];
}

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  fields?: FieldDef[];
  list?: ListDef;
  custom?: 'import' | 'documents' | 'data' | 'history';
}

const YES_NO: Opt[] = [
  { value: '', label: '— Not set —' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const DECLINE_LABEL = 'I prefer not to answer';

export const SECTIONS: SectionDef[] = [
  { id: 'import', title: 'Fill from resume', custom: 'import' },
  {
    id: 'personal',
    title: 'Personal information',
    fields: [
      {
        kind: 'text',
        path: 'profile.personal.firstName',
        label: 'First name',
        autocomplete: 'given-name',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.personal.middleName',
        label: 'Middle name',
        autocomplete: 'additional-name',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.personal.lastName',
        label: 'Last name',
        autocomplete: 'family-name',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.personal.preferredName',
        label: 'Preferred name',
        help: 'Used for "preferred name" questions; defaults to your first name.',
        span: 3,
      },
      {
        kind: 'email',
        path: 'profile.personal.email',
        label: 'Email',
        autocomplete: 'email',
        span: 3,
      },
      {
        kind: 'text',
        path: 'profile.personal.phoneCountryCode',
        label: 'Country code',
        placeholder: '+1',
        span: 2,
      },
      {
        kind: 'tel',
        path: 'profile.personal.phone',
        label: 'Phone',
        placeholder: '(415) 555-0100',
        autocomplete: 'tel-national',
        span: 4,
      },
    ],
  },
  {
    id: 'address',
    title: 'Address',
    fields: [
      {
        kind: 'text',
        path: 'profile.address.line1',
        label: 'Street address',
        autocomplete: 'address-line1',
        span: 4,
      },
      {
        kind: 'text',
        path: 'profile.address.line2',
        label: 'Apt, suite, unit',
        autocomplete: 'address-line2',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.address.city',
        label: 'City',
        autocomplete: 'address-level2',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.address.state',
        label: 'State / province',
        placeholder: 'CA or California',
        autocomplete: 'address-level1',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.address.postalCode',
        label: 'ZIP / postal code',
        autocomplete: 'postal-code',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.address.country',
        label: 'Country',
        autocomplete: 'country-name',
        span: 3,
      },
    ],
  },
  {
    id: 'links',
    title: 'Links',
    fields: [
      {
        kind: 'url',
        path: 'profile.links.linkedin',
        label: 'LinkedIn',
        placeholder: 'https://www.linkedin.com/in/you',
        span: 3,
      },
      {
        kind: 'url',
        path: 'profile.links.github',
        label: 'GitHub',
        placeholder: 'https://github.com/you',
        span: 3,
      },
      {
        kind: 'url',
        path: 'profile.links.portfolio',
        label: 'Personal website / portfolio',
        placeholder: 'https://you.dev',
        span: 3,
      },
      { kind: 'url', path: 'profile.links.twitter', label: 'X / Twitter', span: 3 },
      { kind: 'url', path: 'profile.links.other', label: 'Other link', span: 6 },
    ],
  },
  {
    id: 'documents',
    title: 'Resume & cover letter',
    description:
      'Files are stored only in this browser and attached to upload fields when you click Auto-Fill.',
    custom: 'documents',
    fields: [
      {
        kind: 'textarea',
        path: 'profile.coverLetter',
        label: 'Cover letter text',
        help: 'Pasted into "cover letter" text boxes.',
        rows: 6,
        span: 6,
      },
    ],
  },
  {
    id: 'work',
    title: 'Work experience',
    description:
      'Most recent first. Only empty fields on the page are filled; "Add another" buttons are clicked when a form has fewer slots.',
    list: {
      path: 'profile.work',
      addLabel: '+ Add position',
      empty: 'No positions yet.',
      title: (w, i) => [w.title, w.company].filter(Boolean).join(' @ ') || `Position ${i + 1}`,
      create: createWorkExperience,
      fields: [
        { kind: 'text', path: 'company', label: 'Company', span: 3 },
        { kind: 'text', path: 'title', label: 'Job title', span: 3 },
        {
          kind: 'text',
          path: 'location',
          label: 'Location',
          placeholder: 'San Francisco, CA',
          span: 2,
        },
        { kind: 'month', path: 'startDate', label: 'Start', span: 2 },
        { kind: 'month', path: 'endDate', label: 'End', help: 'Leave empty if current.', span: 2 },
        { kind: 'checkbox', path: 'current', label: 'I currently work here', span: 6 },
        { kind: 'textarea', path: 'description', label: 'Description', rows: 4, span: 6 },
      ],
    },
  },
  {
    id: 'education',
    title: 'Education',
    list: {
      path: 'profile.education',
      addLabel: '+ Add education',
      empty: 'No education yet.',
      title: (e, i) => [e.degree, e.school].filter(Boolean).join(', ') || `Education ${i + 1}`,
      create: createEducation,
      fields: [
        { kind: 'text', path: 'school', label: 'School', span: 3 },
        {
          kind: 'text',
          path: 'degree',
          label: 'Degree',
          list: 'degree-options',
          placeholder: "Bachelor's Degree",
          span: 3,
        },
        { kind: 'text', path: 'fieldOfStudy', label: 'Field of study / major', span: 3 },
        { kind: 'text', path: 'gpa', label: 'GPA', placeholder: '3.8', span: 3 },
        { kind: 'month', path: 'startDate', label: 'Start', span: 3 },
        { kind: 'month', path: 'endDate', label: 'Graduation (or expected)', span: 3 },
      ],
    },
  },
  {
    id: 'skills',
    title: 'Skills & summary',
    fields: [
      {
        kind: 'textarea',
        path: 'profile.skills',
        label: 'Skills',
        placeholder: 'TypeScript, React, SQL, AWS',
        rows: 2,
        span: 6,
      },
      {
        kind: 'text',
        path: 'profile.languages',
        label: 'Languages spoken',
        placeholder: 'English (native), Spanish (conversational)',
        span: 6,
      },
      {
        kind: 'textarea',
        path: 'profile.summary',
        label: 'Professional summary',
        help: 'Used for "Tell us about yourself" / "Summary" boxes.',
        rows: 4,
        span: 6,
      },
    ],
  },
  {
    id: 'preferences',
    title: 'Eligibility & preferences',
    fields: [
      {
        kind: 'select',
        path: 'profile.preferences.authorizedToWork',
        label: 'Legally authorized to work in your country?',
        options: YES_NO,
        span: 3,
      },
      {
        kind: 'select',
        path: 'profile.preferences.requiresSponsorship',
        label: 'Will you require visa sponsorship?',
        options: YES_NO,
        span: 3,
      },
      {
        kind: 'select',
        path: 'profile.preferences.over18',
        label: 'Are you 18 or older?',
        options: YES_NO,
        span: 3,
      },
      {
        kind: 'select',
        path: 'profile.preferences.willingToRelocate',
        label: 'Willing to relocate?',
        options: YES_NO,
        span: 3,
      },
      {
        kind: 'lines',
        path: 'profile.preferences.preferredLocations',
        label: 'Preferred work locations',
        placeholder: 'San Francisco, CA\nNew York, NY\nRemote',
        help: 'One per line. Used for "preferred office/location" questions.',
        span: 3,
      },
      {
        kind: 'multicheck',
        path: 'profile.preferences.workArrangements',
        label: 'Work arrangements you accept',
        options: [
          { value: 'remote', label: 'Remote' },
          { value: 'hybrid', label: 'Hybrid' },
          { value: 'onsite', label: 'On-site' },
        ],
        span: 3,
      },
      {
        kind: 'text',
        path: 'profile.preferences.yearsOfExperience',
        label: 'Years of experience',
        placeholder: 'Calculated from work history if empty',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.preferences.desiredSalary',
        label: 'Desired salary',
        placeholder: '$150,000',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.preferences.noticePeriod',
        label: 'Notice period',
        placeholder: '2 weeks',
        span: 2,
      },
      {
        kind: 'date',
        path: 'profile.preferences.earliestStartDate',
        label: 'Earliest start date',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.preferences.availability',
        label: 'Availability (text)',
        placeholder: 'Immediately',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.preferences.howDidYouHear',
        label: 'How did you hear about us?',
        placeholder: 'LinkedIn',
        span: 2,
      },
      {
        kind: 'text',
        path: 'profile.preferences.citizenship',
        label: 'Citizenship',
        placeholder: 'United States',
        span: 3,
      },
      {
        kind: 'text',
        path: 'profile.preferences.securityClearance',
        label: 'Security clearance',
        placeholder: 'None',
        span: 3,
      },
    ],
  },
  {
    id: 'eeo',
    title: 'Voluntary self-identification',
    description:
      'Optional. U.S. employers ask these for equal-opportunity reporting; they are never used in hiring decisions. Pick "prefer not to answer" to decline. You can switch these answers off entirely in Settings.',
    fields: [
      {
        kind: 'select',
        path: 'profile.eeo.gender',
        label: 'Gender',
        options: [
          { value: '', label: '— Not set —' },
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'nonbinary', label: 'Non-binary' },
          { value: 'decline', label: DECLINE_LABEL },
        ],
        span: 3,
      },
      {
        kind: 'text',
        path: 'profile.eeo.pronouns',
        label: 'Pronouns',
        placeholder: 'she/her, he/him, they/them',
        span: 3,
      },
      {
        kind: 'multicheck',
        path: 'profile.eeo.race',
        label: 'Race / ethnicity (select all that apply)',
        options: [
          { value: 'asian', label: 'Asian' },
          { value: 'black', label: 'Black or African American' },
          { value: 'hispanic', label: 'Hispanic or Latino' },
          { value: 'white', label: 'White' },
          { value: 'native_american', label: 'American Indian or Alaska Native' },
          { value: 'pacific_islander', label: 'Native Hawaiian or Other Pacific Islander' },
          { value: 'middle_eastern', label: 'Middle Eastern or North African' },
          { value: 'two_or_more', label: 'Two or more races' },
          { value: 'decline', label: DECLINE_LABEL },
        ],
        span: 6,
      },
      {
        kind: 'select',
        path: 'profile.eeo.hispanicLatino',
        label: 'Hispanic or Latino?',
        options: [...YES_NO, { value: 'decline', label: DECLINE_LABEL }],
        span: 3,
      },
      {
        kind: 'select',
        path: 'profile.eeo.veteran',
        label: 'Veteran status',
        options: [
          { value: '', label: '— Not set —' },
          { value: 'not_veteran', label: 'I am not a protected veteran' },
          { value: 'protected_veteran', label: 'I am a protected veteran' },
          { value: 'veteran', label: 'Veteran, but not protected' },
          { value: 'decline', label: DECLINE_LABEL },
        ],
        span: 3,
      },
      {
        kind: 'select',
        path: 'profile.eeo.disability',
        label: 'Disability status',
        options: [
          { value: '', label: '— Not set —' },
          { value: 'yes', label: 'Yes, I have a disability (or had one)' },
          { value: 'no', label: 'No, I do not have a disability' },
          { value: 'decline', label: DECLINE_LABEL },
        ],
        span: 3,
      },
      {
        kind: 'select',
        path: 'profile.eeo.sexualOrientation',
        label: 'Sexual orientation',
        options: [
          { value: '', label: '— Not set —' },
          { value: 'heterosexual', label: 'Heterosexual / straight' },
          { value: 'gay', label: 'Gay' },
          { value: 'lesbian', label: 'Lesbian' },
          { value: 'bisexual', label: 'Bisexual / pansexual' },
          { value: 'asexual', label: 'Asexual' },
          { value: 'queer', label: 'Queer' },
          { value: 'decline', label: DECLINE_LABEL },
        ],
        span: 3,
      },
      {
        kind: 'select',
        path: 'profile.eeo.transgender',
        label: 'Do you identify as transgender?',
        options: [...YES_NO, { value: 'decline', label: DECLINE_LABEL }],
        span: 3,
      },
    ],
  },
  {
    id: 'custom',
    title: 'Custom answers',
    description:
      'Teach JobFill any question it does not know. When a field label contains your question text (or is very similar), your answer is used. Answers of "Yes"/"No" also work for radio buttons and checkboxes.',
    list: {
      path: 'profile.customAnswers',
      addLabel: '+ Add answer',
      empty: 'No custom answers yet. Example: "previously worked for" → "No".',
      title: (c, i) => (typeof c.question === 'string' && c.question) || `Answer ${i + 1}`,
      create: createCustomAnswer,
      fields: [
        {
          kind: 'text',
          path: 'question',
          label: 'Question contains',
          placeholder: 'Have you previously worked for',
          span: 3,
        },
        { kind: 'text', path: 'answer', label: 'Answer', placeholder: 'No', span: 3 },
      ],
    },
  },
  {
    id: 'settings',
    title: 'Settings',
    fields: [
      {
        kind: 'select',
        path: 'settings.floatingButton',
        label: 'Show the floating Auto-Fill button',
        options: [
          { value: 'auto', label: 'On job application pages (recommended)' },
          { value: 'always', label: 'On every page' },
          { value: 'never', label: 'Never (use the toolbar popup or Alt+Shift+F)' },
        ],
        span: 6,
      },
      {
        kind: 'checkbox',
        path: 'settings.uploadResume',
        label: 'Upload my resume to resume fields',
        span: 3,
      },
      {
        kind: 'checkbox',
        path: 'settings.uploadCoverLetter',
        label: 'Upload my cover letter file',
        span: 3,
      },
      {
        kind: 'checkbox',
        path: 'settings.fillEeo',
        label: 'Answer voluntary self-identification questions',
        span: 3,
      },
      {
        kind: 'checkbox',
        path: 'settings.addMissingEntries',
        label: 'Click "Add another" for extra jobs/schools',
        span: 3,
      },
      {
        kind: 'checkbox',
        path: 'settings.highlightFields',
        label: 'Outline filled and empty fields on the page',
        span: 3,
      },
      {
        kind: 'checkbox',
        path: 'settings.overwriteExisting',
        label: 'Overwrite values already on the page',
        help: 'Off = only empty fields are filled.',
        span: 3,
      },
      {
        kind: 'checkbox',
        path: 'settings.keepHistory',
        label: 'Keep a local log of applications I auto-fill',
        span: 6,
      },
      {
        kind: 'checkbox',
        path: 'settings.pacing.enabled',
        label: 'Type like a person: one character at a time, with a pause before each field',
        help: 'With the default delays a typical application takes about 5–15 minutes (a long cover letter adds more). Progress and a Stop button are shown on the page. Turn off to fill everything at once.',
        span: 6,
      },
      {
        kind: 'number',
        path: 'settings.pacing.keyMinSec',
        label: 'Delay between characters — shortest',
        min: 0,
        max: 10,
        step: 0.1,
        unit: 'seconds',
        span: 3,
      },
      {
        kind: 'number',
        path: 'settings.pacing.keyMaxSec',
        label: 'Delay between characters — longest',
        min: 0,
        max: 10,
        step: 0.1,
        unit: 'seconds',
        span: 3,
      },
      {
        kind: 'number',
        path: 'settings.pacing.fieldMinSec',
        label: 'Pause before the next field — shortest',
        min: 0,
        max: 120,
        step: 0.5,
        unit: 'seconds',
        span: 3,
      },
      {
        kind: 'number',
        path: 'settings.pacing.fieldMaxSec',
        label: 'Pause before the next field — longest',
        min: 0,
        max: 120,
        step: 0.5,
        unit: 'seconds',
        span: 3,
      },
    ],
  },
  { id: 'history', title: 'Application log', custom: 'history' },
  { id: 'data', title: 'Your data', custom: 'data' },
];

export const DEGREE_SUGGESTIONS = [
  'High School Diploma',
  "Associate's Degree",
  "Bachelor's Degree",
  'Bachelor of Science',
  'Bachelor of Arts',
  "Master's Degree",
  'Master of Science',
  'MBA',
  'PhD',
  'JD',
  'MD',
];
