import type { Documents, Profile } from './types';

export interface CompletenessItem {
  label: string;
  done: boolean;
  /** Anchor of the options-page section where it can be fixed. */
  section: string;
}

/** Checklist of the profile data that matters most to applications. */
export function profileChecklist(profile: Profile, documents: Documents): CompletenessItem[] {
  const p = profile.personal;
  const a = profile.address;
  const pref = profile.preferences;
  const eeo = profile.eeo;
  return [
    { label: 'First & last name', done: !!(p.firstName && p.lastName), section: 'personal' },
    { label: 'Email', done: !!p.email, section: 'personal' },
    { label: 'Phone', done: !!p.phone, section: 'personal' },
    { label: 'City & country', done: !!(a.city && a.country), section: 'address' },
    { label: 'LinkedIn', done: !!profile.links.linkedin, section: 'links' },
    { label: 'Resume uploaded', done: !!documents.resume, section: 'documents' },
    { label: 'Work experience', done: profile.work.length > 0, section: 'work' },
    { label: 'Education', done: profile.education.length > 0, section: 'education' },
    {
      label: 'Work authorization & sponsorship',
      done: !!(pref.authorizedToWork && pref.requiresSponsorship),
      section: 'preferences',
    },
    {
      label: 'Voluntary disclosures',
      done: !!(eeo.gender && eeo.race.length && eeo.veteran && eeo.disability),
      section: 'eeo',
    },
  ];
}

export function completenessPercent(profile: Profile, documents: Documents): number {
  const items = profileChecklist(profile, documents);
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

export function isProfileEmpty(profile: Profile): boolean {
  const p = profile.personal;
  return !p.firstName && !p.lastName && !p.email && !p.phone;
}
