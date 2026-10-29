/**
 * End-to-end runs of the fill engine against the demo forms (the same pages
 * served by `npm run demo`), asserting both what gets filled and what the
 * verification pass reports as still empty.
 */
import { describe, expect, it } from 'vitest';
import { FillEngine } from '../../src/engine/engine';
import type { FrameReport } from '../../src/shared/report';
import {
  byId,
  byName,
  checkedLabels,
  FAST_TIMING,
  loadDemo,
  sampleData,
  selectedText,
} from '../helpers/fixtures';

async function fill(
  page: string,
  overrides: Parameters<typeof sampleData>[0] = {},
): Promise<FrameReport> {
  loadDemo(page);
  return new FillEngine(document, sampleData(overrides), { timing: FAST_TIMING }).fill();
}

const missingLabels = (r: FrameReport, required = true) =>
  r.missing.filter((m) => m.required === required).map((m) => m.label);

const comboValue = (inputId: string) => {
  const box = byId(inputId).closest('.demo-combo')!;
  return box.querySelector<HTMLInputElement>('input[type="hidden"]')!.value;
};

const buttonValue = (id: string) => byId<HTMLButtonElement>(id).textContent?.trim();

describe('Greenhouse-style form', () => {
  it('fills identity, links, questions, education and EEO', async () => {
    const report = await fill('greenhouse-style.html');

    expect(byId('first_name').value).toBe('Ada');
    expect(byId('last_name').value).toBe('Lovelace');
    expect(byId('preferred_name').value).toBe('Ada');
    expect(byId('email').value).toBe('ada@example.com');
    expect(byId('phone').value).toBe('(415) 555-0100');
    expect(comboValue('candidate-location')).toBe('San Francisco, California, United States');
    expect(byId('resume').files?.[0]?.name).toBe('Ada_Lovelace_Resume.pdf');

    expect(byId('question_linkedin').value).toBe('https://www.linkedin.com/in/ada');
    expect(byId('question_website').value).toBe('https://ada.dev');
    expect(comboValue('question_auth')).toBe('Yes');
    expect(selectedText(byId('question_visa'))).toBe('No');
    expect(byId('question_source').value).toBe('LinkedIn');

    expect(selectedText(byId('gender'))).toBe('Female');
    expect(selectedText(byId('hispanic_ethnicity'))).toBe('No');
    expect(selectedText(byId('race'))).toBe('Asian');
    expect(selectedText(byId('veteran_status'))).toBe('I am not a protected veteran');
    expect(selectedText(byId('disability_status'))).toBe(
      'No, I do not have a disability and have not had one in the past',
    );

    // Education: most recent (Stanford) in the first slot, "Add another" clicked for Berkeley.
    expect(comboValue('school--0')).toBe('Stanford University');
    expect(selectedText(byId('degree--0'))).toBe("Master's Degree");
    expect(selectedText(byId('discipline--0'))).toBe('Mathematics');
    expect(selectedText(byId('start-month--0'))).toBe('September');
    expect(byId('start-year--0').value).toBe('2019');
    expect(selectedText(byId('end-month--0'))).toBe('June');
    expect(byId('end-year--0').value).toBe('2021');
    const second = document.querySelectorAll('#education-entries .education')[1]!;
    expect(second).toBeDefined();
    expect(second.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe(
      'University of California, Berkeley',
    );
    expect(selectedText(second.querySelector('select')!)).toBe("Bachelor's Degree");

    // Only the free-text essay question is left for the user.
    expect(missingLabels(report)).toEqual(['Why are you interested in joining our team?']);
    expect(report.fields.filter((f) => f.status === 'filled').length).toBeGreaterThan(20);
  });

  it('ignores the header search box and the footer newsletter form', async () => {
    await fill('greenhouse-style.html');
    expect(byName('newsletter').value).toBe('');
    expect(document.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');
  });

  it('never overwrites values the user already entered', async () => {
    loadDemo('greenhouse-style.html');
    byId('email').value = 'custom@example.org';
    await new FillEngine(document, sampleData(), { timing: FAST_TIMING }).fill();
    expect(byId('email').value).toBe('custom@example.org');
  });

  it('overwrites when the setting is on', async () => {
    loadDemo('greenhouse-style.html');
    byId('email').value = 'custom@example.org';
    await new FillEngine(document, sampleData({ settings: { overwriteExisting: true } }), {
      timing: FAST_TIMING,
    }).fill();
    expect(byId('email').value).toBe('ada@example.com');
  });

  it('leaves voluntary questions alone when disabled', async () => {
    await fill('greenhouse-style.html', { settings: { fillEeo: false } });
    expect(selectedText(byId('gender'))).toBe('Please select');
    expect(byId('first_name').value).toBe('Ada');
  });
});

describe('Lever-style form', () => {
  it('fills wrapped-label fields, links, radios, checkboxes and EEO selects', async () => {
    const report = await fill('lever-style.html');

    expect(byName('name').value).toBe('Ada Lovelace');
    expect(byName('email').value).toBe('ada@example.com');
    expect(byName('phone').value).toBe('(415) 555-0100');
    expect(byName('location').value).toBe('San Francisco, CA');
    expect(byName('org').value).toBe('Analytical Engines Inc');
    expect(byName('resume').files?.[0]?.name).toBe('Ada_Lovelace_Resume.pdf');

    expect(byName('urls[LinkedIn]').value).toBe('https://www.linkedin.com/in/ada');
    expect(byName('urls[Twitter]').value).toBe('https://x.com/ada');
    expect(byName('urls[GitHub]').value).toBe('https://github.com/ada');
    expect(byName('urls[Portfolio]').value).toBe('https://ada.dev');
    expect(byName('urls[Other]').value).toBe('https://blog.ada.dev');

    expect(checkedLabels('cards[q1][field0]')).toEqual(['Yes']);
    expect(checkedLabels('cards[q2][field0]')).toEqual([
      'San Francisco',
      'New York',
      'Remote (US)',
    ]);
    expect(selectedText(byName('cards[q3][field0]'))).toBe('3-5');
    expect(checkedLabels('cards[q4][field0]')).toEqual(['No']);
    expect(byName<HTMLTextAreaElement>('comments').value).toBe(
      'Dear hiring team, I would love to join.',
    );

    expect(selectedText(byName('eeo[gender]'))).toBe('Female');
    expect(selectedText(byName('eeo[race]'))).toBe('Asian');
    expect(selectedText(byName('eeo[veteran]'))).toBe('I am not a veteran');
    expect(selectedText(byName('eeo[disability]'))).toBe("No, I don't have a disability");

    expect(missingLabels(report)).toHaveLength(1);
    expect(missingLabels(report)[0]).toMatch(/processing of my personal data/);
  });
});

describe('Workday-style form', () => {
  it('fills button dropdowns, adds work/education entries and split dates', async () => {
    const report = await fill('workday-style.html');

    expect(buttonValue('country-btn')).toBe('United States of America');
    expect(byId('input-2').value).toBe('Ada');
    expect(byId('input-3').value).toBe('Lovelace');
    expect(byId('input-4').value).toBe('1 Market St');
    expect(byId('input-5').value).toBe('San Francisco');
    expect(buttonValue('state-btn')).toBe('California');
    expect(byId('input-6').value).toBe('94105');
    expect(buttonValue('device-btn')).toBe('Mobile');
    expect(buttonValue('code-btn')).toBe('United States of America (+1)');
    expect(byId('input-7').value).toBe('(415) 555-0100');
    expect(byId('input-8').value).toBe('ada@example.com');
    expect(buttonValue('source-btn')).toBe('LinkedIn');

    // Two work entries were added and filled, most recent first.
    expect(document.querySelectorAll('#work-entries .entry')).toHaveLength(2);
    expect(byId('jobTitle-1').value).toBe('Senior Software Engineer');
    expect(byId('company-1').value).toBe('Analytical Engines Inc');
    expect(byId<HTMLInputElement>('current-1').checked).toBe(true);
    expect(byId('from-month-1').value).toBe('03');
    expect(byId('from-year-1').value).toBe('2022');
    expect(byId('to-month-1').value).toBe('');
    expect(byId('jobTitle-2').value).toBe('Software Engineer');
    expect(byId<HTMLInputElement>('current-2').checked).toBe(false);
    expect(byId('to-month-2').value).toBe('02');
    expect(byId('to-year-2').value).toBe('2022');
    expect(byId<HTMLTextAreaElement>('desc-2').value).toBe('Built compilers.');

    expect(document.querySelectorAll('#education-entries .entry')).toHaveLength(2);
    expect(byId('school-1').value).toBe('Stanford University');
    expect(buttonValue('degree-1')).toBe("Master's Degree");
    expect(byId('field-1').value).toBe('Mathematics');
    expect(byId('gpa-1').value).toBe('4.0');
    expect(byId('edu-from-year-1').value).toBe('2019');
    expect(byId('edu-to-year-1').value).toBe('2021');
    expect(byId('school-2').value).toBe('University of California, Berkeley');

    expect(
      document.querySelector<HTMLInputElement>('[data-automation-id="file-upload-input-ref"]')!
        .files?.[0]?.name,
    ).toBe('Ada_Lovelace_Resume.pdf');
    expect(byId('linkedin').value).toBe('https://www.linkedin.com/in/ada');

    expect(buttonValue('q-auth')).toBe('Yes');
    expect(buttonValue('q-visa')).toBe('No');
    expect(buttonValue('q-age')).toBe('Yes');
    expect(buttonValue('gender-btn')).toBe('Female');
    expect(buttonValue('eth-btn')).toBe('Asian (United States of America)');
    expect(buttonValue('vet-btn')).toBe('I am not a veteran');
    expect(checkedLabels('disabilityStatus')).toEqual([
      'No, I do not have a disability and have not had one in the past',
    ]);

    expect(missingLabels(report)).toEqual(['I have read and consent to the terms and conditions']);
  });
});

describe('Custom careers page', () => {
  it('handles placeholder-only inputs, shadow DOM, ranges, custom questions and flags the rest', async () => {
    const report = await fill('generic.html');

    expect(byName('fname').value).toBe('Ada');
    expect(byName('lname').value).toBe('Lovelace');
    expect(byName('contact_email').value).toBe('ada@example.com');
    expect(byName('mobile').value).toBe('(415) 555-0100');
    expect(byName('loc').value).toBe('San Francisco, CA');
    expect(byId('street').value).toBe('1 Market St');
    expect(byId('city').value).toBe('San Francisco');
    expect(selectedText(byId('state'))).toBe('California');
    expect(byId('zip').value).toBe('94105');
    const shadowInput = document
      .querySelector('pronoun-field')!
      .shadowRoot!.querySelector('input')!;
    expect(shadowInput.value).toBe('she/her');

    expect(byName('linkedin_url').value).toBe('https://www.linkedin.com/in/ada');
    expect(byName('github').value).toBe('https://github.com/ada');
    expect(byName('site').value).toBe('https://ada.dev');

    expect(selectedText(byId('yoe'))).toBe('3-5 years');
    expect(byId('salary').value).toBe('150000');
    expect(byId('start').value).toBe('2026-11-02');
    expect(byId('school').value).toBe('Stanford University');
    expect(byId('grad').value).toBe('2021-06');
    expect(checkedLabels('relocate')).toEqual(['Yes']);
    expect(checkedLabels('arrangement')).toEqual(['Remote', 'Hybrid']);
    expect(checkedLabels('visa')).toEqual(['No']);
    expect(checkedLabels('prev')).toEqual(['No']);

    expect(checkedLabels('gender')).toEqual(['Woman']);
    expect(checkedLabels('race')).toEqual(['Asian']);
    expect(selectedText(byId('vet'))).toBe('No');
    expect(selectedText(byId('dis'))).toBe('No');

    expect(byName('newsletter').value).toBe('');
    expect(missingLabels(report)).toEqual([
      'Why do you want to join Globex?',
      'I consent to Globex storing my application data',
    ]);
  });
});

describe('verification', () => {
  it('flags empty fields and highlights them on the page', async () => {
    loadDemo('lever-style.html');
    const engine = new FillEngine(document, sampleData(), { timing: FAST_TIMING });
    const report = await engine.verify();
    const required = missingLabels(report);
    expect(required).toEqual(expect.arrayContaining(['Resume/CV', 'Full name', 'Email']));
    expect(document.querySelectorAll('[data-jobfill-flag="required"]').length).toBe(
      required.length,
    );
    expect(engine.focus(report.missing[0]!.ref)).toBe(true);
  });

  it('reports nothing on a page without an application form', async () => {
    document.body.innerHTML = '<form role="search"><input type="search"></form><p>Hello</p>';
    const report = await new FillEngine(document, sampleData(), { timing: FAST_TIMING }).fill();
    expect(report.fields).toHaveLength(0);
    expect(report.missing).toHaveLength(0);
  });

  it('clears previous highlights on the next run', async () => {
    loadDemo('lever-style.html');
    const engine = new FillEngine(document, sampleData(), { timing: FAST_TIMING });
    await engine.verify();
    await engine.fill();
    expect(document.querySelectorAll('[data-jobfill-flag="required"]').length).toBe(1);
  });
});
