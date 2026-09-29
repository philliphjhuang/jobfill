import { describe, expect, it } from 'vitest';
import { detectAts, findEmbeddedAts } from '../../src/engine/ats';
import { classifyAll } from '../../src/engine/classifier';
import { findAddButton } from '../../src/engine/entries';
import { fillField, setInputFiles, withSubmitGuard } from '../../src/engine/fillers';
import { clearHighlights, highlight } from '../../src/engine/highlight';
import { scanFields } from '../../src/engine/scanner';
import { readValue } from '../../src/engine/values';
import { mount } from '../helpers/fixtures';

const OPTS = { overwrite: false, comboboxTimeoutMs: 50 };

function firstField(html: string) {
  mount(`<form>${html}</form>`);
  const [field] = classifyAll(scanFields(document.body));
  if (!field) throw new Error('no field');
  return field;
}

describe('fillers', () => {
  it('sets values in a way frameworks notice (input + change events)', async () => {
    const field = firstField('<label for="a">City</label><input id="a">');
    const events: string[] = [];
    field.el.addEventListener('input', () => events.push('input'));
    field.el.addEventListener('change', () => events.push('change'));
    const out = await fillField(field, { text: 'Paris' }, OPTS);
    expect(out.status).toBe('filled');
    expect((field.el as HTMLInputElement).value).toBe('Paris');
    expect(events).toEqual(['input', 'change']);
  });

  it('respects maxlength and numeric inputs', async () => {
    const short = firstField('<label for="a">Zip</label><input id="a" maxlength="5">');
    await fillField(short, { text: '94105-1234' }, OPTS);
    expect((short.el as HTMLInputElement).value).toBe('94105');
    const num = firstField('<label for="b">Salary</label><input id="b" type="number">');
    await fillField(num, { text: '$150,000' }, OPTS);
    expect((num.el as HTMLInputElement).value).toBe('150000');
  });

  it('reports no-match instead of guessing', async () => {
    const field = firstField(
      '<label for="s">Degree</label><select id="s"><option value="">Select</option><option>Doctorate</option></select>',
    );
    const out = await fillField(field, { candidates: ["Bachelor's Degree"] }, OPTS);
    expect(out.status).toBe('no-match');
    expect(readValue(field)).toBe('');
  });

  it('does not uncheck a box the user ticked', async () => {
    const field = firstField('<label><input type="checkbox" checked> Currently work here</label>');
    const out = await fillField(field, { bool: false }, OPTS);
    expect(out.status).toBe('skipped');
    expect((field.el as HTMLInputElement).checked).toBe(true);
  });

  it('attaches files even without DataTransfer support', () => {
    mount('<input type="file" id="f">');
    const input = document.getElementById('f') as HTMLInputElement;
    let changed = false;
    input.addEventListener('change', () => (changed = true));
    const ok = setInputFiles(input, [new File(['x'], 'cv.pdf', { type: 'application/pdf' })]);
    expect(ok).toBe(true);
    expect(input.files?.[0]?.name).toBe('cv.pdf');
    expect(changed).toBe(true);
  });

  it('blocks accidental form submission while clicking', () => {
    mount('<form id="f"><button id="b">Add another</button></form>');
    let submitted = false;
    document.getElementById('f')!.addEventListener('submit', () => (submitted = true));
    withSubmitGuard(document, () => document.getElementById('b')!.click());
    expect(submitted).toBe(false);
  });
});

describe('entries', () => {
  it('finds the right "Add" button and ignores unrelated ones', () => {
    mount(`<form>
      <h3>Work experience</h3><button type="button" id="w">+ Add another</button>
      <h3>Education</h3><button type="button" id="e">Add</button><button type="button" id="att">Add attachment</button>
      <h3>Links</h3><button type="button" id="l">Add</button>
    </form>`);
    expect(findAddButton(document, 'work')?.id).toBe('w');
    expect(findAddButton(document, 'education')?.id).toBe('e');
  });

  it('accepts explicit button text anywhere', () => {
    mount('<form><button type="button" id="x">Add Work Experience</button></form>');
    expect(findAddButton(document, 'work')?.id).toBe('x');
    expect(findAddButton(document, 'education')).toBeNull();
  });
});

describe('highlighting', () => {
  it('restores the original outline', () => {
    mount('<input id="a" style="outline: 1px solid blue">');
    const el = document.getElementById('a')!;
    highlight(el, 'required');
    expect(el.getAttribute('data-jobfill-flag')).toBe('required');
    clearHighlights(document);
    expect(el.style.outline).toBe('1px solid blue');
    expect(el.hasAttribute('data-jobfill-flag')).toBe(false);
  });
});

describe('ATS detection', () => {
  it.each([
    ['boards.greenhouse.io', 'greenhouse'],
    ['job-boards.greenhouse.io', 'greenhouse'],
    ['jobs.lever.co', 'lever'],
    ['acme.wd5.myworkdayjobs.com', 'workday'],
    ['jobs.ashbyhq.com', 'ashby'],
    ['careers.example.com', undefined],
  ])('%s → %s', (host, id) => {
    expect(detectAts(host)?.id).toBe(id);
  });

  it('spots embedded ATS iframes', () => {
    mount('<iframe id="grnhse_iframe" src="about:blank"></iframe>');
    expect(findEmbeddedAts(document)?.id).toBe('greenhouse');
  });
});
