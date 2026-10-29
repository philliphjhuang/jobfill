import { describe, expect, it } from 'vitest';
import { applyChange, planImport } from '../../src/resume/merge';
import { emptyResumeData, type ResumeData } from '../../src/resume/parse';
import { createEmptyProfile, createWorkExperience } from '../../src/shared/defaults';

function resume(): ResumeData {
  const d = emptyResumeData();
  d.personal = {
    firstName: 'Jordan',
    middleName: '',
    lastName: 'Rivera',
    email: 'jordan@example.com',
    phone: '(512) 555-0147',
    phoneCountryCode: '',
  };
  d.address = {
    line1: '',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'United States',
  };
  d.links.linkedin = 'https://linkedin.com/in/jordanrivera';
  d.skills = 'TypeScript, React';
  d.work = [
    {
      title: 'Senior Software Engineer',
      company: 'Lone Star Analytics',
      location: 'Austin, TX',
      startDate: '2023-01',
      endDate: '',
      current: true,
      description: '• Led migrations.',
    },
    {
      title: 'Software Engineer',
      company: 'Bluebonnet Labs',
      location: 'Remote',
      startDate: '2020-06',
      endDate: '2022-12',
      current: false,
      description: '',
    },
  ];
  d.education = [
    {
      school: 'University of Texas at Austin',
      degree: 'Bachelor of Science',
      fieldOfStudy: 'Computer Science',
      gpa: '3.8',
      startDate: '2016-08',
      endDate: '2020-05',
    },
  ];
  return d;
}

describe('planImport', () => {
  it('fills an empty profile without asking anything', () => {
    const { profile, plan } = planImport(createEmptyProfile(), resume());
    expect(plan.conflicts).toEqual([]);
    expect(profile.personal.firstName).toBe('Jordan');
    expect(profile.address.city).toBe('Austin');
    expect(profile.work).toHaveLength(2);
    expect(profile.work[0]).toMatchObject({
      company: 'Lone Star Analytics',
      current: true,
      startDate: '2023-01',
    });
    expect(profile.education[0]!.gpa).toBe('3.8');
    expect(plan.addedWork).toBe(2);
    expect(plan.addedEducation).toBe(1);
    // Default country already matches, default "+1" code is left alone.
    expect(plan.filled.some((c) => c.path === 'address.country')).toBe(false);
    expect(profile.personal.phoneCountryCode).toBe('+1');
  });

  it('asks before replacing values that differ, and skips equivalent ones', () => {
    const existing = createEmptyProfile();
    existing.personal.firstName = 'JORDAN';
    existing.personal.email = 'old@example.com';
    existing.personal.phone = '512.555.0147';
    existing.links.linkedin = 'https://www.linkedin.com/in/jordanrivera/';
    existing.skills = 'Go';
    existing.work = [
      {
        ...createWorkExperience(),
        company: 'Lone Star Analytics Inc',
        title: 'Software Engineer II',
      },
    ];

    const before = structuredClone(existing);
    const { profile, plan } = planImport(existing, resume());

    expect(existing).toEqual(before); // input is not mutated
    const conflicts = Object.fromEntries(
      plan.conflicts.map((c) => [c.path, [c.current, c.proposed]]),
    );
    expect(conflicts).toEqual({
      'personal.email': ['old@example.com', 'jordan@example.com'],
      skills: ['Go', 'TypeScript, React'],
      'work.0.title': ['Software Engineer II', 'Senior Software Engineer'],
      'work.0.current': ['No', 'Yes'],
    });
    // Conflicting values are untouched until the user decides…
    expect(profile.personal.email).toBe('old@example.com');
    expect(profile.work[0]!.title).toBe('Software Engineer II');
    // …while empty fields on the matched entry were filled right away.
    expect(profile.work[0]!.startDate).toBe('2023-01');
    expect(profile.work[0]!.location).toBe('Austin, TX');
    // The unmatched job is added as a new entry.
    expect(profile.work[1]!.company).toBe('Bluebonnet Labs');
    expect(plan.addedWork).toBe(1);
  });

  it('applies decisions, converting yes/no back to booleans', () => {
    const existing = createEmptyProfile();
    existing.work = [
      { ...createWorkExperience(), company: 'Lone Star Analytics', title: 'Engineer' },
    ];
    const { profile, plan } = planImport(existing, resume());
    const current = plan.conflicts.find((c) => c.path === 'work.0.current')!;
    applyChange(profile, current, current.proposed);
    expect(profile.work[0]!.current).toBe(true);
    const title = plan.conflicts.find((c) => c.path === 'work.0.title')!;
    applyChange(profile, title, 'Staff Engineer');
    expect(profile.work[0]!.title).toBe('Staff Engineer');
  });

  it('offers to fix a school name that had the degree mixed in', () => {
    const existing = createEmptyProfile();
    existing.education = [
      {
        id: 'e1',
        school: 'Master of Science in Computer Science, University of Southern California',
        degree: '',
        fieldOfStudy: '',
        gpa: '',
        startDate: '2024-08',
        endDate: '2026-05',
      },
    ];
    const data = emptyResumeData();
    data.education = [
      {
        school: 'University of Southern California',
        degree: 'Master of Science',
        fieldOfStudy: 'Computer Science',
        gpa: '',
        startDate: '2024-08',
        endDate: '2026-05',
      },
    ];
    const { profile, plan } = planImport(existing, data);
    expect(plan.addedEducation).toBe(0); // matched the existing entry
    expect(plan.conflicts.map((c) => [c.path, c.proposed])).toEqual([
      ['education.0.school', 'University of Southern California'],
    ]);
    expect(profile.education[0]).toMatchObject({
      degree: 'Master of Science',
      fieldOfStudy: 'Computer Science',
    });
  });

  it('treats a re-import of the same resume as a no-op', () => {
    const first = planImport(createEmptyProfile(), resume()).profile;
    const second = planImport(first, resume());
    expect(second.plan.filled).toEqual([]);
    expect(second.plan.conflicts).toEqual([]);
    expect(second.profile.work).toHaveLength(2);
  });
});
