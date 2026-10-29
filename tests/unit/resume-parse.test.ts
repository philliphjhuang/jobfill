import { describe, expect, it } from 'vitest';
import { itemsToLines, textToExtract, type PdfTextItem } from '../../src/resume/extract';
import { findRange, parsePlace, parseResume, sectionOf, toYearMonth } from '../../src/resume/parse';

/** Two-column template (like "Jake's resume"): title + right-aligned dates, then company + location. */
const TWO_COLUMN = [
  'JORDAN AVERY RIVERA',
  'Austin, TX 78701 | (512) 555-0147 | jordan.rivera@example.com | linkedin.com/in/jordanrivera | github.com/jrivera',
  'SUMMARY',
  'Full-stack engineer with 5 years of experience building data-heavy web applications.',
  'EXPERIENCE',
  'Senior Software Engineer\tJan 2023 – Present',
  'Lone Star Analytics, Austin, TX',
  '• Led migration of the reporting stack to TypeScript and React, cutting load',
  'times by 40%.',
  '• Mentored four engineers.',
  'Software Engineer\tJun 2020 – Dec 2022',
  'Bluebonnet Labs\tRemote',
  '• Built ETL pipelines in Python processing 2M events per day.',
  'EDUCATION',
  'University of Texas at Austin\tAustin, TX',
  'B.S. in Computer Science, GPA: 3.8\tAug 2016 – May 2020',
  'SKILLS',
  'Languages: TypeScript, Python, SQL, Go',
  'Frameworks: React, Node.js, Django',
];

/** Company line above "Title, dates"; international phone; UK locations. */
const COMPANY_FIRST = [
  'Priya Natarajan',
  'priya.n@example.org · +44 20 7946 0958 · London, UK',
  'https://priya.design',
  'Professional Experience',
  'Moonpig Ltd — London, UK',
  'Product Designer, March 2021 – Present',
  '- Redesigned the checkout flow, lifting conversion by 12%.',
  'Acme Studio — Brighton, UK',
  'Junior Designer, Sept 2018 – Feb 2021',
  '- Built the design system.',
  'Education',
  'Master of Arts in Interaction Design',
  'Royal College of Art, 2016 - 2018',
  'Bachelor of Arts, Graphic Design — University of Brighton (2013–2016)',
  'Languages',
  'English (native), Tamil (fluent)',
];

/** Student resume: education first, expected graduation, internships, bulleted skills. */
const STUDENT = [
  'Sam Lee',
  'sam.lee@example.edu',
  '(206) 555-0199',
  'Seattle, Washington',
  'EDUCATION',
  'University of Washington, Seattle, WA',
  'Bachelor of Science in Informatics',
  'Expected June 2027 | GPA 3.65/4.0',
  'INTERNSHIPS',
  'Software Engineering Intern',
  'Cascade Robotics Inc. June 2025 - September 2025',
  '• Wrote firmware tests in C++.',
  'TECHNICAL SKILLS',
  '• Python, Java, C++',
  '• Git, Linux',
  'PROJECTS',
  'Campus Map App',
];

describe('resume parser — two-column template', () => {
  const r = parseResume({ lines: TWO_COLUMN, links: ['https://jordanrivera.dev'] });

  it('reads contact details', () => {
    expect(r.personal).toEqual({
      firstName: 'Jordan',
      middleName: 'Avery',
      lastName: 'Rivera',
      email: 'jordan.rivera@example.com',
      phone: '(512) 555-0147',
      phoneCountryCode: '',
    });
    expect(r.address).toEqual({
      line1: '',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'United States',
    });
    expect(r.links.linkedin).toBe('https://linkedin.com/in/jordanrivera');
    expect(r.links.github).toBe('https://github.com/jrivera');
    expect(r.links.portfolio).toBe('https://jordanrivera.dev');
    expect(r.summary).toMatch(/^Full-stack engineer/);
  });

  it('splits work experience into entries', () => {
    expect(r.work).toHaveLength(2);
    expect(r.work[0]).toEqual({
      title: 'Senior Software Engineer',
      company: 'Lone Star Analytics',
      location: 'Austin, TX',
      startDate: '2023-01',
      endDate: '',
      current: true,
      description:
        '• Led migration of the reporting stack to TypeScript and React, cutting load times by 40%.\n• Mentored four engineers.',
    });
    expect(r.work[1]).toMatchObject({
      title: 'Software Engineer',
      company: 'Bluebonnet Labs',
      location: 'Remote',
      startDate: '2020-06',
      endDate: '2022-12',
      current: false,
    });
  });

  it('reads education and skills', () => {
    expect(r.education).toEqual([
      {
        school: 'University of Texas at Austin',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
        gpa: '3.8',
        startDate: '2016-08',
        endDate: '2020-05',
      },
    ]);
    expect(r.skills).toBe('TypeScript, Python, SQL, Go, React, Node.js, Django');
  });
});

describe('resume parser — company-first layout', () => {
  const r = parseResume(textToExtract(COMPANY_FIRST.join('\n')));

  it('reads international contact details', () => {
    expect(r.personal.firstName).toBe('Priya');
    expect(r.personal.lastName).toBe('Natarajan');
    expect(r.personal.phoneCountryCode).toBe('+44');
    expect(r.personal.phone).toBe('20 7946 0958');
    expect(r.address.city).toBe('London');
    expect(r.address.country).toBe('United Kingdom');
    expect(r.links.portfolio).toBe('https://priya.design');
  });

  it('takes the heading line above the dated title', () => {
    expect(
      r.work.map((w) => [w.title, w.company, w.location, w.startDate, w.endDate, w.current]),
    ).toEqual([
      ['Product Designer', 'Moonpig Ltd', 'London, UK', '2021-03', '', true],
      ['Junior Designer', 'Acme Studio', 'Brighton, UK', '2018-09', '2021-02', false],
    ]);
    expect(r.work[1]!.description).toBe('• Built the design system.');
  });

  it('pairs degrees with schools', () => {
    expect(r.education).toEqual([
      {
        school: 'Royal College of Art',
        degree: 'Master of Arts',
        fieldOfStudy: 'Interaction Design',
        gpa: '',
        startDate: '2016-01',
        endDate: '2018-01',
      },
      {
        school: 'University of Brighton',
        degree: 'Bachelor of Arts',
        fieldOfStudy: 'Graphic Design',
        gpa: '',
        startDate: '2013-01',
        endDate: '2016-01',
      },
    ]);
    expect(r.languages).toBe('English (native), Tamil (fluent)');
  });
});

describe('resume parser — student resume', () => {
  const r = parseResume(textToExtract(STUDENT.join('\n')));

  it('reads contact lines and a full state name', () => {
    expect(r.personal).toMatchObject({
      firstName: 'Sam',
      lastName: 'Lee',
      email: 'sam.lee@example.edu',
      phone: '(206) 555-0199',
    });
    expect(r.address).toMatchObject({
      city: 'Seattle',
      state: 'Washington',
      country: 'United States',
    });
  });

  it('reads expected graduation and GPA', () => {
    expect(r.education[0]).toEqual({
      school: 'University of Washington',
      degree: 'Bachelor of Science',
      fieldOfStudy: 'Informatics',
      gpa: '3.65',
      startDate: '',
      endDate: '2027-06',
    });
  });

  it('treats internships as work and ignores projects', () => {
    expect(r.work).toEqual([
      {
        title: 'Software Engineering Intern',
        company: 'Cascade Robotics Inc.',
        location: '',
        startDate: '2025-06',
        endDate: '2025-09',
        current: false,
        description: '• Wrote firmware tests in C++.',
      },
    ]);
    expect(r.skills).toBe('Python, Java, C++, Git, Linux');
  });
});

describe('resume parser — reported issues', () => {
  it('splits "Degree in Field, School" lines into degree, field and school', () => {
    const r = parseResume(
      textToExtract(
        [
          'Phillip Example',
          'EDUCATION',
          'Master of Science in Computer Science, University of Southern California\tAug 2024 – May 2026',
          'Bachelor of Science in Computer Science, Rutgers University\tSep 2020 – Jan 2024',
        ].join('\n'),
      ),
    );
    expect(r.education).toEqual([
      {
        school: 'University of Southern California',
        degree: 'Master of Science',
        fieldOfStudy: 'Computer Science',
        gpa: '',
        startDate: '2024-08',
        endDate: '2026-05',
      },
      {
        school: 'Rutgers University',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
        gpa: '',
        startDate: '2020-09',
        endDate: '2024-01',
      },
    ]);
  });

  it.each([
    [
      'B.S. Computer Science, Rutgers University, GPA: 3.9',
      'Rutgers University',
      'Bachelor of Science',
      'Computer Science',
      '3.9',
    ],
    [
      'University of California, Berkeley, B.A. Economics',
      'University of California, Berkeley',
      'Bachelor of Arts',
      'Economics',
      '',
    ],
    [
      'Master of Science in Data Science from Columbia University',
      'Columbia University',
      'Master of Science',
      'Data Science',
      '',
    ],
    [
      'MBA, Stanford Graduate School of Business',
      'Stanford Graduate School of Business',
      'MBA',
      '',
      '',
    ],
  ])('%s', (line, school, degree, fieldOfStudy, gpa) => {
    const r = parseResume(
      textToExtract(['Sam Lee', 'Education', `${line}\t2019 – 2021`].join('\n')),
    );
    expect(r.education[0]).toMatchObject({ school, degree, fieldOfStudy, gpa });
  });

  it('never turns phone or email hyperlinks into a website', () => {
    const r = parseResume({
      lines: ['Phillip Example', 'Los Angeles, CA', 'Experience'],
      links: ['tel:+18582528304', 'mailto:phillip@example.com?subject=Hi', 'https://phillip.dev/'],
    });
    expect(r.links.portfolio).toBe('https://phillip.dev');
    expect(r.links.other).toBe('');
    // …but they fill in contact details the text didn't show.
    expect(r.personal.phone).toBe('(858) 252-8304');
    expect(r.personal.phoneCountryCode).toBe('+1');
    expect(r.personal.email).toBe('phillip@example.com');
  });

  it('prefers the phone and email written in the text over hyperlinks', () => {
    const r = parseResume({
      lines: ['Phillip Example', '(213) 555-0100 | me@example.com', 'Experience'],
      links: ['tel:+18582528304', 'mailto:other@example.com'],
    });
    expect(r.personal.phone).toBe('(213) 555-0100');
    expect(r.personal.email).toBe('me@example.com');
  });
});

describe('resume parser — building blocks', () => {
  it('recognises section headings', () => {
    expect(sectionOf('Work Experience')).toBe('work');
    expect(sectionOf('EDUCATION:')).toBe('education');
    expect(sectionOf('PROFESSIONAL EXPERIENCE & LEADERSHIP')).toBe('work');
    expect(sectionOf('Languages: Python, Go')).toBeNull();
    expect(sectionOf('Led the platform team')).toBeNull();
  });

  it('parses dates and ranges', () => {
    expect(toYearMonth('Sept. 2019')).toBe('2019-09');
    expect(toYearMonth('Fall 2021')).toBe('2021-09');
    expect(toYearMonth('03/2020')).toBe('2020-03');
    expect(toYearMonth('2020-3')).toBe('2020-03');
    expect(toYearMonth('2018')).toBe('2018-01');
    expect(findRange('Engineer, Jan 2020 to present')).toEqual({
      start: '2020-01',
      end: '',
      current: true,
    });
    expect(findRange('2019-2021')).toEqual({ start: '2019-01', end: '2021-01', current: false });
    expect(findRange('Call (512) 555-2019')).toBeNull();
  });

  it('parses places', () => {
    expect(parsePlace('Boston, MA 02110')).toEqual({
      city: 'Boston',
      state: 'MA',
      postalCode: '02110',
      country: 'United States',
    });
    expect(parsePlace('Toronto, Canada')?.country).toBe('Canada');
    expect(parsePlace('Remote')?.city).toBe('Remote');
    expect(parsePlace('Graphic Design')).toBeNull();
  });

  it('rebuilds PDF lines and marks column gaps with tabs', () => {
    const item = (str: string, x: number, y: number, width: number): PdfTextItem => ({
      str,
      transform: [10, 0, 0, 10, x, y],
      width,
      height: 10,
    });
    const lines = itemsToLines([
      item('Engineer', 72, 700, 45),
      item('Jan 2020 – Present', 450, 700.4, 90),
      item('Acme', 72, 686, 25),
      item('Inc', 99, 686, 15),
      item('Title', 72, 720, 25),
    ]);
    expect(lines).toEqual(['Title', 'Engineer\tJan 2020 – Present', 'Acme Inc']);
  });
});
