import { describe, expect, it } from 'vitest';
import { classifyAll } from '../../src/engine/classifier';
import { datePartOf, formatDateFor, parseDate, totalYears } from '../../src/engine/dates';
import { assignEntryIndices } from '../../src/engine/entries';
import type { ClassifiedField } from '../../src/engine/model';
import { orderedWork, resolveValue } from '../../src/engine/resolver';
import { scanFields } from '../../src/engine/scanner';
import type { Profile } from '../../src/shared/types';
import { mount, sampleData, sampleProfile } from '../helpers/fixtures';

function fieldsFor(html: string, profile?: Profile): ClassifiedField[] {
  mount(`<form>${html}</form>`);
  const fields = classifyAll(scanFields(document.body), { customAnswers: profile?.customAnswers });
  assignEntryIndices(fields);
  return fields;
}

function resolve(html: string, profile: Profile = sampleProfile()) {
  const [field] = fieldsFor(html, profile);
  if (!field) throw new Error('no field');
  const data = sampleData({ profile });
  return resolveValue(field, { profile: data.profile, documents: data.documents });
}

const yesNo = (label: string) =>
  `<label for="q">${label}</label><select id="q"><option value="">Select</option><option>Yes</option><option>No</option></select>`;

describe('resolver', () => {
  it('builds full name and location strings', () => {
    expect(resolve('<label for="n">Full name</label><input id="n">')?.text).toBe('Ada Lovelace');
    const loc = resolve('<label for="l">Current location</label><input id="l">');
    expect(loc?.text).toBe('San Francisco, CA');
    expect(loc?.candidates).toContain('San Francisco, California');
  });

  it('adds the country code only when the field asks for it', () => {
    expect(resolve('<label for="p">Phone</label><input id="p">')?.text).toBe('(415) 555-0100');
    expect(
      resolve('<label for="p">Phone</label><input id="p" placeholder="+1 555 555 5555">')?.text,
    ).toBe('+1 (415) 555-0100');
  });

  it('answers yes/no eligibility questions', () => {
    expect(resolve(yesNo('Are you legally authorized to work in the US?'))?.bool).toBe(true);
    expect(resolve(yesNo('Will you require visa sponsorship?'))?.bool).toBe(false);
    // Inverse phrasing: authorized *without* sponsorship → yes when no sponsorship is needed.
    expect(resolve(yesNo('Can you work in the US without sponsorship?'))?.bool).toBe(true);
    expect(resolve(yesNo('Are you at least 18 years old?'))?.bool).toBe(true);
    expect(resolve(yesNo('Are you under 18 years of age?'))?.bool).toBe(false);
  });

  it('returns nothing when the profile has no answer', () => {
    const p = sampleProfile();
    p.preferences.willingToRelocate = '';
    expect(resolve(yesNo('Are you willing to relocate?'), p)).toBeNull();
  });

  it('answers work-arrangement questions from preferences', () => {
    expect(resolve(yesNo('Are you open to a hybrid schedule?'))?.bool).toBe(true);
    expect(resolve(yesNo('Are you able to work on-site five days a week?'))?.bool).toBe(false);
  });

  it('translates EEO answers into candidate phrases', () => {
    const race = resolve(
      '<label for="r">Race</label><select id="r"><option>Asian</option><option>White</option></select>',
    );
    expect(race?.candidates?.[0]).toBe('Asian');
    const multi = sampleProfile();
    multi.eeo.race = ['asian', 'white'];
    const mixed = resolve(
      '<label for="r">Race</label><select id="r"><option>Asian</option><option>White</option></select>',
      multi,
    );
    expect(mixed?.candidates?.[0]).toBe('Two or More Races');
    expect(mixed?.multi).toHaveLength(2);
    const vet = resolve(yesNo('Are you a veteran?'));
    expect(vet?.bool).toBe(false);
  });

  it('orders work experience most-recent first and skips the end date of a current role', () => {
    expect(orderedWork(sampleProfile().work).map((w) => w.id)).toEqual(['w1', 'w2']);
    const fields = fieldsFor(`<h3>Work experience</h3>
      <label for="c">Company</label><input id="c">
      <label for="e">End date</label><input id="e">
      <label for="c2">Company</label><input id="c2">
      <label for="e2">End date</label><input id="e2" placeholder="MM/YYYY">`);
    const data = sampleData();
    const values = fields.map((f) => resolveValue(f, data));
    expect(values[0]?.text).toBe('Analytical Engines Inc');
    expect(values[1]?.skipReason).toMatch(/current/i);
    expect(values[2]?.text).toBe('Babbage Labs');
    expect(values[3]?.text).toBe('02/2022');
  });

  it('computes years of experience when not given', () => {
    const p = sampleProfile();
    p.preferences.yearsOfExperience = '';
    const r = resolve('<label for="y">Years of experience</label><input id="y">', p);
    expect(r?.number).toBeGreaterThanOrEqual(7);
  });

  it('uses custom answers', () => {
    const p = sampleProfile();
    p.customAnswers = [{ id: 'x', question: 'favorite color', answer: 'Blue' }];
    expect(
      resolve('<label for="f">What is your favorite color?</label><input id="f">', p)?.text,
    ).toBe('Blue');
  });

  it('attaches the resume file', () => {
    expect(resolve('<label for="r">Resume</label><input type="file" id="r">')?.file?.name).toBe(
      'Ada_Lovelace_Resume.pdf',
    );
  });
});

describe('dates', () => {
  it('parses stored dates', () => {
    expect(parseDate('2021-06')).toEqual({ year: 2021, month: 6, day: 1 });
    expect(parseDate('2021-13')).toBeNull();
    expect(parseDate('June 2021')).toBeNull();
  });

  it.each([
    ['<input id="d" type="month">', '2021-06'],
    ['<input id="d" type="date">', '2021-06-01'],
    ['<input id="d" placeholder="MM/YYYY">', '06/2021'],
    ['<input id="d" placeholder="MM/DD/YYYY">', '06/01/2021'],
    ['<input id="d" placeholder="YYYY-MM">', '2021-06'],
    ['<input id="d" placeholder="MM/YY">', '06/21'],
    ['<input id="d" aria-label="Year" placeholder="YYYY">', '2021'],
    ['<input id="d" aria-label="Month" placeholder="MM">', '06'],
  ])('formats %s as %s', (html, expected) => {
    const [field] = fieldsFor(html);
    expect(formatDateFor(field!, { year: 2021, month: 6, day: 1 })).toBe(expected);
  });

  it('detects month/year selects from their options', () => {
    const [months] = fieldsFor(
      `<select id="m"><option>Month</option>${['January', 'February', 'March', 'April'].map((m) => `<option>${m}</option>`).join('')}</select>`,
    );
    expect(datePartOf(months!)).toBe('month');
    const [years] = fieldsFor(
      `<select id="y"><option>Year</option><option>2019</option><option>2020</option><option>2021</option></select>`,
    );
    expect(datePartOf(years!)).toBe('year');
  });

  it('sums career length', () => {
    const now = new Date('2026-01-15');
    expect(totalYears([{ start: '2019-06', end: '', current: true }], now)).toBe(6);
    expect(totalYears([{ start: 'bad', end: '', current: false }], now)).toBe(0);
  });
});
