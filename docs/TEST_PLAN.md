# Test Plan

## 1. Strategy

| Level       | Tooling                               | Scope                                                                                                                                                  | Runs                |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Static      | `tsc --strict`, ESLint, Prettier      | Types, unsafe patterns (`innerHTML` banned), formatting                                                                                                | Every commit/PR     |
| Unit        | Vitest + jsdom (`tests/unit`)         | Text normalization, option matching, classifier rule table, scanner labels, resolver, dates, storage/migration, report merge, fillers, panel rendering | Every commit/PR     |
| Integration | Vitest + jsdom (`tests/integration`)  | Full `FillEngine.fill()` on four ATS-style fixtures in `demo/`, with interactive widgets                                                               | Every commit/PR     |
| End-to-end  | Puppeteer + real Chrome (`tests/e2e`) | Built extension loaded unpacked: detection, floating button, service worker orchestration, `executeScript` across frames, panel, focus, history        | CI + before release |
| Manual      | Checklist below                       | Real ATS sites, visual review, multi-step flows                                                                                                        | Before release      |

Coverage thresholds (enforced by `npm run coverage`): lines/statements 70 %, functions 70 %,
branches 60 %. Current: ~87 % lines.

## 2. Fixtures

`demo/` contains mock forms that reproduce the markup patterns of common ATSs (not copies of any
real site). They double as manual test pages (`npm run demo`).

| Fixture                 | Exercises                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `greenhouse-style.html` | `<label for>`, React-Select-style comboboxes, hidden file input, education repeater, split month/year, EEO selects, header search and footer newsletter that must be ignored |
| `lever-style.html`      | Wrapping labels, `✱` required marker, `urls[...]` link fields, radio + checkbox questions, numeric range select, custom answer, cover letter textarea, consent box           |
| `workday-style.html`    | `data-automation-id` fields, button dropdowns portaled to `<body>`, "Add" work/education sections, grouped Month/Year inputs, disability checkbox group with vague legend    |
| `generic.html`          | Div labels, placeholder-only input, shadow-DOM field, `type=number/date/month`, fieldset radios, checkbox groups, paragraph questions, required essay                        |

## 3. Traceability

| Requirement                | Verified by                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| FR-1–FR-9 profile data     | `shared.test.ts` (storage round-trip, migration), e2e profile seeding, manual editor checklist                           |
| FR-11 import/export/delete | `shared.test.ts` (`normalizeProfile`, `clearAll`), manual                                                                |
| FR-20 detection            | e2e (button appears on all fixtures), `fillers-and-entries.test.ts` (ATS host + iframe detection)                        |
| FR-22 all frames           | `shared.test.ts` (`mergeFrameReports`), e2e                                                                              |
| FR-23 resume first         | integration (resume attached on every fixture), `fillers-and-entries.test.ts` (`setInputFiles`)                          |
| FR-24 classification       | `classifier.test.ts` (~80 labelled cases), `scanner.test.ts`                                                             |
| FR-25 control kinds        | `scanner.test.ts`, integration (every kind appears in a fixture)                                                         |
| FR-26 fuzzy matching       | `text-and-matcher.test.ts` (EEO wording, negation, countries, degrees, ranges)                                           |
| FR-27 entries              | `classifier.test.ts` (indexing), `fillers-and-entries.test.ts` (Add button), integration (Workday, Greenhouse repeaters) |
| FR-28 no overwrite/submit  | integration ("never overwrites"), `fillers-and-entries.test.ts` (submit guard, checkbox not unchecked)                   |
| FR-30 EEO toggle           | integration ("leaves voluntary questions alone")                                                                         |
| FR-40–FR-42 verification   | integration (`missing` lists, highlight attributes, `focus`), e2e (click focuses field)                                  |
| FR-45 history              | `shared.test.ts` (cap, clear), e2e (entries recorded)                                                                    |
| NFR-2 XSS safety           | `panel.test.ts` (label rendered as text), ESLint rule                                                                    |

## 4. Manual release checklist

Run on the packaged build (`npm run package`, load `dist/` unpacked) with a realistic profile.

- [ ] Fresh install opens the profile editor; completeness bar updates as fields are filled.
- [ ] Upload/replace/preview/remove resume; files over 10 MB are rejected with a message.
- [ ] Export → delete all data → import restores profile, settings and (optionally) files.
- [ ] On one live posting each for Greenhouse, Lever, Ashby and Workday (do **not** submit):
  - [ ] floating button appears; Alt+Shift+F and the popup also work;
  - [ ] resume attaches; parsed values are not overwritten;
  - [ ] work/education entries fill; extra entries are added where supported;
  - [ ] EEO answers match the profile; "decline" works;
  - [ ] panel lists only genuinely empty fields; clicking scrolls to them.
- [ ] A company careers page with an embedded Greenhouse iframe shows the button in the top page.
- [ ] Setting "floating button: never" hides it; "always" shows it on any page.
- [ ] The extension produces no console errors on non-application pages (news site, Gmail).
- [ ] Chrome Task Manager shows no persistent CPU use from the content script on idle pages.

## 5. Defect handling

Bugs are filed with the **Bug report** or **Site not filling correctly** issue templates. A fix
should come with a failing test first (usually a new classifier case or a fixture tweak).
