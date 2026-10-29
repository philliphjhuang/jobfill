import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installAll } from '../../demo/widgets.js';
import type { EngineTiming } from '../../src/engine/engine';
import { DEFAULT_SETTINGS, createEmptyProfile } from '../../src/shared/defaults';
import type { Profile, Settings, StoredData } from '../../src/shared/types';

export const FAST_TIMING: EngineTiming = {
  settleQuietMs: 10,
  settleMaxMs: 60,
  uploadQuietMs: 10,
  uploadMaxMs: 60,
  comboboxTimeoutMs: 120,
};

/** Load a demo page's <body> into the jsdom document and wire up its widgets. */
export function loadDemo(name: string): void {
  const html = readFileSync(join(process.cwd(), 'demo', name), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
  document.title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');
  installAll(document);
}

/** Replace the document body with an HTML snippet. */
export function mount(html: string): void {
  document.body.innerHTML = html;
}

export function sampleProfile(): Profile {
  const p = createEmptyProfile();
  p.personal = {
    firstName: 'Ada',
    middleName: '',
    lastName: 'Lovelace',
    preferredName: 'Ada',
    email: 'ada@example.com',
    phone: '(415) 555-0100',
    phoneCountryCode: '+1',
  };
  p.address = {
    line1: '1 Market St',
    line2: 'Apt 5',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'United States',
  };
  p.links = {
    linkedin: 'https://www.linkedin.com/in/ada',
    github: 'https://github.com/ada',
    portfolio: 'https://ada.dev',
    twitter: 'https://x.com/ada',
    other: 'https://blog.ada.dev',
  };
  p.work = [
    {
      id: 'w2',
      company: 'Babbage Labs',
      title: 'Software Engineer',
      location: 'London, UK',
      startDate: '2019-06',
      endDate: '2022-02',
      current: false,
      description: 'Built compilers.',
    },
    {
      id: 'w1',
      company: 'Analytical Engines Inc',
      title: 'Senior Software Engineer',
      location: 'San Francisco, CA',
      startDate: '2022-03',
      endDate: '',
      current: true,
      description: 'Led the platform team.',
    },
  ];
  p.education = [
    {
      id: 'e1',
      school: 'University of California, Berkeley',
      degree: "Bachelor's Degree",
      fieldOfStudy: 'Computer Science',
      gpa: '3.9',
      startDate: '2015-08',
      endDate: '2019-05',
    },
    {
      id: 'e2',
      school: 'Stanford University',
      degree: "Master's Degree",
      fieldOfStudy: 'Mathematics',
      gpa: '4.0',
      startDate: '2019-09',
      endDate: '2021-06',
    },
  ];
  p.skills = 'TypeScript, React, Node.js';
  p.languages = 'English';
  p.summary = 'Engineer who loves compilers.';
  p.coverLetter = 'Dear hiring team, I would love to join.';
  p.preferences = {
    preferredLocations: ['San Francisco, CA', 'New York, NY', 'Remote'],
    workArrangements: ['remote', 'hybrid'],
    willingToRelocate: 'yes',
    authorizedToWork: 'yes',
    requiresSponsorship: 'no',
    over18: 'yes',
    yearsOfExperience: '4',
    desiredSalary: '$150,000',
    noticePeriod: '2 weeks',
    earliestStartDate: '2026-11-02',
    availability: '',
    howDidYouHear: 'LinkedIn',
    securityClearance: '',
    citizenship: 'United States',
  };
  p.eeo = {
    gender: 'female',
    pronouns: 'she/her',
    race: ['asian'],
    hispanicLatino: 'no',
    veteran: 'not_veteran',
    disability: 'no',
    sexualOrientation: '',
    transgender: '',
  };
  p.customAnswers = [{ id: 'c1', question: 'worked for', answer: 'No' }];
  return p;
}

export function sampleData(
  overrides: { profile?: Profile; settings?: Partial<Settings> } = {},
): StoredData {
  return {
    profile: overrides.profile ?? sampleProfile(),
    // Tests fill instantly unless they opt into pacing (it is on by default for users).
    settings: {
      ...DEFAULT_SETTINGS,
      pacing: { ...DEFAULT_SETTINGS.pacing, enabled: false },
      ...overrides.settings,
    },
    documents: {
      resume: {
        name: 'Ada_Lovelace_Resume.pdf',
        type: 'application/pdf',
        size: 13,
        data: btoa('%PDF-1.4 test'),
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      coverLetter: null,
    },
  };
}

export function byId<T extends HTMLElement = HTMLInputElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

export function byName<T extends HTMLElement = HTMLInputElement>(name: string): T {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) throw new Error(`[name=${name}] not found`);
  return el as T;
}

export function selectedText(select: HTMLSelectElement): string {
  return select.selectedOptions[0]?.textContent?.trim() ?? '';
}

export function checkedLabels(name: string): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`),
  ).map((i) => i.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() ?? i.value);
}
