import { describe, expect, it } from 'vitest';
import { classifyAll, classifyField } from '../../src/engine/classifier';
import { assignEntryIndices } from '../../src/engine/entries';
import type { FieldType } from '../../src/engine/model';
import { scanFields } from '../../src/engine/scanner';
import { mount } from '../helpers/fixtures';

function typeOf(html: string, opts: Parameters<typeof classifyField>[1] = {}): FieldType | null {
  mount(`<form>${html}</form>`);
  const [field] = scanFields(document.body);
  if (!field) throw new Error('no field scanned');
  return classifyField(field, opts)?.type ?? null;
}

const text = (label: string) => `<label for="x">${label}</label><input id="x" type="text">`;
const select = (label: string, options: string[]) =>
  `<label for="x">${label}</label><select id="x"><option value="">Select</option>${options
    .map((o) => `<option>${o}</option>`)
    .join('')}</select>`;
const yesNo = (label: string) => select(label, ['Yes', 'No']);

describe('classifier — text labels', () => {
  it.each<[string, FieldType]>([
    ['First Name', 'firstName'],
    ['Legal first name *', 'firstName'],
    ['Given name', 'firstName'],
    ['Last Name', 'lastName'],
    ['Surname', 'lastName'],
    ['Middle initial', 'middleName'],
    ['Preferred first name', 'preferredName'],
    ['Full name', 'fullName'],
    ['Name', 'fullName'],
    ['Full legal name (first and last)', 'fullName'],
    ['Email', 'email'],
    ['E-mail address', 'email'],
    ['Confirm email', 'email'],
    ['Phone number', 'phone'],
    ['Mobile', 'phone'],
    ['Address line 1', 'address1'],
    ['Street address', 'address1'],
    ['Address line 2', 'address2'],
    ['City', 'city'],
    ['State / Province', 'state'],
    ['ZIP code', 'postalCode'],
    ['Postal code', 'postalCode'],
    ['Country', 'country'],
    ['Location (City)', 'location'],
    ['Current location', 'location'],
    ['City, State', 'location'],
    ['Where are you currently located?', 'location'],
    ['LinkedIn Profile', 'linkedin'],
    ['GitHub URL', 'github'],
    ['Portfolio', 'portfolio'],
    ['Personal website', 'portfolio'],
    ['Twitter handle', 'twitter'],
    ['Other website', 'otherUrl'],
    ['Current company', 'work.company'],
    ['Current job title', 'work.title'],
    ['School', 'edu.school'],
    ['University', 'edu.school'],
    ['Degree', 'edu.degree'],
    ['Field of study', 'edu.field'],
    ['Major', 'edu.field'],
    ['GPA', 'edu.gpa'],
    ['Expected graduation date', 'edu.end'],
    ['Desired salary', 'salary'],
    ['Notice period', 'noticePeriod'],
    ['When can you start?', 'availableStart'],
    ['How did you hear about us?', 'howHeard'],
    ['Pronouns', 'pronouns'],
    ['Years of experience', 'yearsExperience'],
    ['Signature (type your full name)', 'fullName'],
  ])('%s → %s', (label, expected) => {
    expect(typeOf(text(label))).toBe(expected);
  });

  it('does not treat reference / emergency contacts as the applicant', () => {
    expect(typeOf(text('Reference email'))).not.toBe('email');
    expect(typeOf(text('Emergency contact phone'))).not.toBe('phone');
    expect(typeOf(text('Company name'))).not.toBe('fullName');
  });

  it('leaves unknown questions unclassified', () => {
    expect(
      typeOf('<label for="x">Why do you want to work here?</label><textarea id="x"></textarea>'),
    ).toBeNull();
  });
});

describe('classifier — choice questions', () => {
  it.each<[string, FieldType]>([
    ['Are you legally authorized to work in the United States?', 'workAuthorization'],
    [
      'Will you now or in the future require sponsorship for employment visa status?',
      'sponsorship',
    ],
    ['Are you authorized to work in the US without sponsorship?', 'sponsorship'],
    ['Are you willing to relocate?', 'relocate'],
    ['Are you at least 18 years of age?', 'over18'],
    ['Gender', 'gender'],
    ['Are you Hispanic/Latino?', 'hispanic'],
    ['Please identify your race', 'race'],
    ['Veteran Status', 'veteran'],
    ['Disability Status', 'disability'],
    ['Sexual orientation', 'sexualOrientation'],
    ['Do you identify as transgender?', 'transgender'],
    ['Are you comfortable working on-site 3 days a week?', 'workArrangement'],
    ['Which of our offices would you prefer?', 'preferredLocations'],
    ['Do you have an active security clearance?', 'clearance'],
    ['Are you a U.S. citizen?', 'citizenship'],
  ])('%s → %s', (label, expected) => {
    expect(typeOf(yesNo(label))).toBe(expected);
  });

  it('classifies radio groups by their question', () => {
    const html = `<fieldset><legend>Are you willing to relocate?</legend>
      <label><input type="radio" name="r" value="y"> Yes</label>
      <label><input type="radio" name="r" value="n"> No</label></fieldset>`;
    expect(typeOf(html)).toBe('relocate');
  });

  it('falls back to the options when the question is vague', () => {
    const html = `<fieldset><legend>Please check one of the boxes below:</legend>
      <label><input type="checkbox" name="d" value="1"> Yes, I have a disability</label>
      <label><input type="checkbox" name="d" value="2"> No, I do not have a disability</label>
      <label><input type="checkbox" name="d" value="3"> I do not want to answer</label></fieldset>`;
    expect(typeOf(html)).toBe('disability');
  });

  it('recognises a lone currently-work-here checkbox', () => {
    expect(typeOf('<label><input type="checkbox" name="c"> I currently work here</label>')).toBe(
      'work.current',
    );
  });
});

describe('classifier — signals', () => {
  it('uses autocomplete attributes', () => {
    expect(typeOf('<input autocomplete="family-name">')).toBe('lastName');
  });

  it('uses name/id attributes when there is no label', () => {
    expect(typeOf('<input name="candidate_email">')).toBe('email');
    expect(typeOf('<input data-automation-id="legalNameSection_firstName">')).toBe('firstName');
  });

  it('uses placeholders', () => {
    expect(typeOf('<input name="q7" placeholder="https://github.com/you">')).toBe('github');
  });

  it('applies site hints first', () => {
    expect(
      typeOf('<input id="weird_1">', { hints: [{ selector: '#weird_1', type: 'linkedin' }] }),
    ).toBe('linkedin');
  });

  it("prefers the user's custom answers", () => {
    const customAnswers = [{ id: 'c', question: 'previously worked for Globex', answer: 'No' }];
    expect(typeOf(yesNo('Have you previously worked for Globex?'), { customAnswers })).toBe(
      'custom',
    );
    const keywords = [{ id: 'k', question: 'relative employed', answer: 'No' }];
    expect(
      typeOf(yesNo('Do you have a relative currently employed here?'), { customAnswers: keywords }),
    ).toBe('custom');
  });

  it('uses section headings to disambiguate work vs education', () => {
    mount(`<form>
      <h3>Work Experience</h3>
      <label for="c1">Company</label><input id="c1"><label for="t1">Title</label><input id="t1">
      <label for="s1">Start date</label><input id="s1"><label for="e1">End date</label><input id="e1">
      <label for="c2">Company</label><input id="c2"><label for="t2">Title</label><input id="t2">
      <h3>Education</h3>
      <label for="sc">School</label><input id="sc"><label for="sd">Start date</label><input id="sd">
      <h3>Other</h3>
      <label for="av">Start date</label><input id="av">
    </form>`);
    const fields = classifyAll(scanFields(document.body));
    assignEntryIndices(fields);
    const summary = fields.map(
      (f) => `${f.el.id}:${f.classification?.type}:${f.classification?.index}`,
    );
    expect(summary).toEqual([
      'c1:work.company:0',
      't1:work.title:0',
      's1:work.start:0',
      'e1:work.end:0',
      'c2:work.company:1',
      't2:work.title:1',
      'sc:edu.school:0',
      'sd:edu.start:0',
      'av:availableStart:0',
    ]);
  });

  it('treats an unlabeled upload as the resume', () => {
    mount('<form><label for="n">Name</label><input id="n"><input type="file" id="f"></form>');
    const fields = classifyAll(scanFields(document.body));
    expect(fields.find((f) => f.kind === 'file')?.classification?.type).toBe('resume');
  });
});
