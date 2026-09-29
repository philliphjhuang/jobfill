# Software Requirements Specification — JobFill

| Version | Date       | Status   |
| ------- | ---------- | -------- |
| 1.0     | 2026-09-28 | Baseline |

## 1. Purpose and scope

Job seekers re-type the same information into dozens of applicant tracking systems (ATS), each
with different layouts and wording. JobFill is a Chrome extension that stores the applicant's
information locally and fills application forms on demand, then verifies the result and points out
anything left empty.

**In scope:** Chrome (Manifest V3) extension; profile editor; in-page fill of text, dropdowns,
radio buttons, checkboxes, comboboxes, dates and file uploads; verification report; local storage.

**Out of scope for 1.0:** submitting applications, writing essay answers, resume parsing into the
profile, cloud sync, job search/tracking, browsers other than Chromium.

## 2. Stakeholders and users

| Stakeholder          | Interest                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| Job seeker (primary) | Apply faster and with fewer mistakes; keep personal data private.           |
| Maintainer           | A codebase where new sites/questions can be supported with small changes.   |
| Chrome Web Store     | Policy compliance: single purpose, minimal permissions, privacy disclosure. |

## 3. User stories

- **US-1** As a job seeker, I enter my information once so that I never retype it.
- **US-2** As a job seeker, I click one button on an application page to fill it.
- **US-3** As a job seeker, my resume is attached automatically.
- **US-4** As a job seeker, my work and education history fills in, including extra entries.
- **US-5** As a job seeker, voluntary EEO questions are answered the way I chose, including
  "decline to answer".
- **US-6** As a job seeker, after filling I see exactly which fields still need me.
- **US-7** As a job seeker, my data never leaves my computer.
- **US-8** As a job seeker, I can teach the tool answers to questions it does not know.
- **US-9** As a job seeker, I can back up, restore and delete my data.

## 4. Functional requirements

### Profile management

| ID    | Requirement                                                                                                                                                                                                                                           | Story |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-1  | The user can store personal info (first/middle/last/preferred name, email, phone + country code).                                                                                                                                                     | US-1  |
| FR-2  | The user can store an address (street, unit, city, state, postal code, country).                                                                                                                                                                      | US-1  |
| FR-3  | The user can store LinkedIn, GitHub, portfolio/website, X/Twitter and one other link.                                                                                                                                                                 | US-1  |
| FR-4  | The user can upload a resume and a cover letter file (PDF/DOC/DOCX/RTF/TXT/ODT, ≤ 10 MB) and cover-letter text.                                                                                                                                       | US-3  |
| FR-5  | The user can store any number of work experiences (company, title, location, start, end, current, description) and reorder them.                                                                                                                      | US-4  |
| FR-6  | The user can store any number of education entries (school, degree, field, GPA, start, graduation).                                                                                                                                                   | US-4  |
| FR-7  | The user can store eligibility & preferences: work authorization, sponsorship, 18+, relocation, preferred locations, work arrangements, years of experience, salary, notice period, start date/availability, referral source, citizenship, clearance. | US-1  |
| FR-8  | The user can store voluntary self-identification answers: gender, pronouns, race/ethnicity (multi), Hispanic/Latino, veteran, disability, sexual orientation, transgender — each with a "prefer not to answer" choice.                                | US-5  |
| FR-9  | The user can define custom question → answer pairs.                                                                                                                                                                                                   | US-8  |
| FR-10 | Changes save automatically; the editor shows save status and a profile-completeness checklist.                                                                                                                                                        | US-1  |
| FR-11 | The user can export the profile to JSON (optionally with files), import it, and delete all data.                                                                                                                                                      | US-9  |

### Filling

| ID    | Requirement                                                                                                                                                                                                                                                      | Story |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-20 | A floating **Auto-Fill** button appears on pages that look like job applications (known ATS host, embedded ATS iframe, or form heuristics); configurable to always/never.                                                                                        | US-2  |
| FR-21 | Filling can also be started from the toolbar popup and the keyboard shortcut Alt+Shift+F.                                                                                                                                                                        | US-2  |
| FR-22 | The fill runs in every frame of the tab, including cross-origin ATS iframes.                                                                                                                                                                                     | US-2  |
| FR-23 | The resume is uploaded before other fields, and the fill waits for the page to settle (ATS resume parsing).                                                                                                                                                      | US-3  |
| FR-24 | Each field is classified from its label, ARIA attributes, placeholder, name/id/data attributes, autocomplete token, section heading, options and site hints.                                                                                                     | US-2  |
| FR-25 | Supported controls: text/email/tel/url/number inputs, textareas, native selects (single/multi), radio groups, checkboxes and checkbox groups, ARIA comboboxes (typeahead and button dropdowns), date/month inputs, file inputs, fields inside open shadow roots. | US-2  |
| FR-26 | Choice answers are matched fuzzily against the options offered (synonyms, abbreviations, negation-aware), numeric ranges are matched by value.                                                                                                                   | US-5  |
| FR-27 | Work/education entries fill most-recent first; if the form has fewer entries than the profile, the matching "Add" button is clicked.                                                                                                                             | US-4  |
| FR-28 | Only empty fields are filled unless "overwrite" is enabled; the tool never submits a form and never checks consent boxes on the user's behalf.                                                                                                                   | US-2  |
| FR-29 | Fields revealed by earlier answers (conditional questions) are filled in a second pass.                                                                                                                                                                          | US-2  |
| FR-30 | Voluntary questions can be disabled globally.                                                                                                                                                                                                                    | US-5  |

### Verification and reporting

| ID    | Requirement                                                                                                    | Story |
| ----- | -------------------------------------------------------------------------------------------------------------- | ----- |
| FR-40 | After filling, every in-scope field is re-read from the DOM to confirm it holds a value.                       | US-6  |
| FR-41 | Empty required fields are outlined red, empty optional fields amber, filled fields green (configurable).       | US-6  |
| FR-42 | A results panel lists counts and each empty field; clicking an item scrolls to and focuses it (across frames). | US-6  |
| FR-43 | The panel lists fields JobFill filled and questions it could not answer, with the reason.                      | US-6  |
| FR-44 | A "Re-check" action re-runs verification without filling.                                                      | US-6  |
| FR-45 | Each fill is recorded in a local application log (URL, title, ATS, counts), which can be disabled and cleared. | US-6  |

## 5. Non-functional requirements

| ID     | Category        | Requirement                                                                                                                              |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1  | Privacy         | No network requests, analytics or remote code. All data in `chrome.storage.local`.                                                       |
| NFR-2  | Security        | Page-derived text is never inserted as HTML; extension pages use the default MV3 CSP; no `eval`.                                         |
| NFR-3  | Permissions     | Only `storage`, `unlimitedStorage`, `scripting`, `activeTab` and http(s) host access (needed to fill any careers site).                  |
| NFR-4  | Performance     | A typical single-page application fills in under 5 s; idle content-script cost stays negligible (debounced detection, capped observers). |
| NFR-5  | Compatibility   | Chrome 110+; works with React/Vue/Angular controlled inputs.                                                                             |
| NFR-6  | Isolation       | In-page UI lives in a shadow root; page CSS cannot affect it and it does not affect the page.                                            |
| NFR-7  | Accessibility   | UI controls are real buttons/labels, keyboard reachable, with ARIA roles for dialogs, progress and live status.                          |
| NFR-8  | Maintainability | Strict TypeScript, lint + format enforced in CI, engine free of `chrome.*` APIs so it is unit-testable.                                  |
| NFR-9  | Quality         | ≥ 70 % line coverage enforced; integration tests on four ATS-style fixtures; real-browser e2e test.                                      |
| NFR-10 | Reliability     | A failure in one field never aborts the run; errors are reported per field.                                                              |

## 6. Acceptance criteria (release 1.0)

1. On each bundled demo form (Greenhouse-, Lever-, Workday-style and a custom page) every field
   the profile can answer is filled, and the only required fields reported empty are free-text
   essays and consent boxes. _(Automated: `tests/integration`, `tests/e2e`.)_
2. Values typed by the user before clicking Auto-Fill are preserved. _(Automated.)_
3. With voluntary questions disabled, no EEO field is touched. _(Automated.)_
4. Clicking an item in the results panel focuses that field. _(Automated e2e.)_
5. `npm run check` passes and the packaged zip loads in Chrome without errors.

## 7. Constraints and assumptions

- Chrome's MV3 content scripts cannot use ES modules, so bundles are IIFEs.
- Closed shadow roots and canvas-rendered forms are not reachable by any extension.
- Some ATSs reject synthetic events (`isTrusted`); those fields are reported as not filled so
  the user can complete them.
