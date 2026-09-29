import { describe, expect, it } from 'vitest';
import { scanFields } from '../../src/engine/scanner';
import { installShadowField } from '../../demo/widgets.js';
import { mount } from '../helpers/fixtures';

const labels = () => scanFields(document.body).map((f) => f.label);

describe('scanner — labels', () => {
  it('reads <label for>, wrapping labels and aria-label', () => {
    mount(`<form>
      <label for="a">First name</label><input id="a">
      <label>Last name <input name="b"></label>
      <input aria-label="Email address">
    </form>`);
    expect(labels()).toEqual(['First name', 'Last name', 'Email address']);
  });

  it('reads aria-labelledby, including multiple ids', () => {
    mount(`<form><span id="l1">Phone</span><span id="l2">(mobile)</span>
      <input aria-labelledby="l1 l2"></form>`);
    expect(labels()).toEqual(['Phone (mobile)']);
  });

  it('finds text in a preceding div when there is no label element', () => {
    mount(`<form>
      <div class="row"><div class="lbl">Given name</div><div><input name="x"></div></div>
      <div class="row"><span>Mobile number</span><input name="y"></div>
    </form>`);
    expect(labels()).toEqual(['Given name', 'Mobile number']);
  });

  it("does not borrow the previous field's label", () => {
    mount(`<form><label for="a">City</label><input id="a"><input name="unlabeled"></form>`);
    expect(labels()).toEqual(['City', '']);
  });

  it('prefixes generic labels with their group label (split dates)', () => {
    mount(`<form><div role="group" aria-labelledby="g"><span id="g">From *</span>
      <input aria-label="Month"><input aria-label="Year"></div></form>`);
    const fields = scanFields(document.body);
    expect(fields.map((f) => f.labelNorm)).toEqual(['from month', 'from year']);
    expect(fields.every((f) => f.required)).toBe(true);
  });

  it('excludes select option text from labels', () => {
    mount(
      `<form><label>Country <select><option>Canada</option><option>Mexico</option></select></label></form>`,
    );
    expect(labels()).toEqual(['Country']);
  });
});

describe('scanner — groups and kinds', () => {
  it('groups radios by name and finds the question', () => {
    mount(`<form><div class="q"><p>Do you require visa sponsorship? *</p>
      <div><label><input type="radio" name="v" value="1">Yes</label><label><input type="radio" name="v" value="0">No</label></div>
    </div></form>`);
    const [field] = scanFields(document.body);
    expect(field?.kind).toBe('radio');
    expect(field?.label).toBe('Do you require visa sponsorship?');
    expect(field?.required).toBe(true);
    expect(field?.options.map((o) => o.label)).toEqual(['Yes', 'No']);
  });

  it('uses fieldset legends for checkbox groups', () => {
    mount(`<form><fieldset><legend>Preferred work arrangement</legend>
      <label><input type="checkbox" name="a" value="r"> Remote</label>
      <label><input type="checkbox" name="a" value="h"> Hybrid</label></fieldset></form>`);
    const [field] = scanFields(document.body);
    expect(field?.kind).toBe('checkbox-group');
    expect(field?.label).toBe('Preferred work arrangement');
  });

  it('detects comboboxes, dates, files and textareas', () => {
    mount(`<form>
      <input role="combobox" aria-label="School">
      <button type="button" aria-haspopup="listbox" aria-label="Degree">Select One</button>
      <input type="month" aria-label="Start">
      <input type="file" aria-label="Resume" style="display:none">
      <textarea aria-label="Cover letter"></textarea>
    </form>`);
    expect(scanFields(document.body).map((f) => f.kind)).toEqual([
      'combobox',
      'combobox',
      'date',
      'file',
      'textarea',
    ]);
  });

  it('recognises required markers', () => {
    mount(`<form>
      <label for="a">A *</label><input id="a">
      <label for="b">B ✱</label><input id="b">
      <label for="c">C</label><input id="c" required>
      <label for="d">D</label><input id="d" aria-required="true">
      <label for="e">E (optional)</label><input id="e">
    </form>`);
    expect(scanFields(document.body).map((f) => f.required)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('scanner — scope', () => {
  it('skips hidden, disabled, header/footer and password inputs', () => {
    mount(`<header><input name="search_box"></header>
      <form>
        <input name="visible">
        <input name="hidden_style" style="display:none">
        <div hidden><input name="hidden_attr"></div>
        <input name="off" disabled>
        <input type="password" name="pw">
        <input type="hidden" name="h">
        <input type="submit" value="Go">
      </form>
      <footer><input type="email" name="newsletter"></footer>`);
    expect(scanFields(document.body).map((f) => f.el.getAttribute('name'))).toEqual(['visible']);
  });

  it('descends into open shadow roots', () => {
    installShadowField(document);
    mount('<form><pronoun-field label="Your pronouns"></pronoun-field></form>');
    const [field] = scanFields(document.body);
    expect(field?.label).toBe('Your pronouns');
  });

  it('never scans its own UI', () => {
    mount(
      '<form><input aria-label="Real"></form><div id="jobfill-host"><input aria-label="Ours"></div>',
    );
    expect(labels()).toEqual(['Real']);
  });
});
