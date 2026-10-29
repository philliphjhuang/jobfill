# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Fill profile from resume** (PDF, DOCX, TXT), parsed entirely on-device: name, contact
  details, location, LinkedIn/GitHub/portfolio links (including hyperlink targets), summary, work
  history, education, skills and languages. Empty profile fields are filled immediately; fields
  that already hold a different value are reviewed one by one with **Yes / No / Edit** (with Undo
  and "Yes/No to all remaining"). Available from the top of the profile editor, next to the saved
  resume, and from the popup when the profile is empty.
- Sample resumes `demo/sample-resume.pdf` and `demo/sample-resume.docx`.
- **Type like a person** (on by default): text is typed one character at a time with a random
  0.1–0.9 s between characters, and a random 3–7 s pause before each new field. Both ranges and
  the feature itself are adjustable in Settings.
- Live progress in the page panel (field N of M, current action, time left) with a **Stop**
  button; a stopped run finishes the field being typed and shows what is still empty. Typing
  pauses while the tab is in the background.

### Changed

- Development toolchain moved to Node.js 24 LTS (22.22+ also supported); Node 20 reached
  end-of-life in April 2026. CI now tests Node 22 and 24. This unblocks jsdom 30, which no longer
  runs on Node 20. (Using the extension needs only Chrome.)
- Fill runs are event-driven: the service worker starts a run and relays messages instead of
  waiting for it, so long paced runs survive Chrome's 5-minute limit per service-worker call
  ([ADR 0005](docs/adr/0005-human-paced-typing-and-event-driven-runs.md)). The popup now starts a
  fill and points to the page for progress and results.
- Minimum Chrome version is now 120 (required by pdf.js).
- First runtime dependency: `pdfjs-dist` 4.10.38, bundled into the profile editor only
  ([ADR 0004](docs/adr/0004-local-resume-parsing-with-pdfjs.md)).

## [1.0.0] - 2026-09-28

### Added

- Profile editor: personal info, address, links, resume and cover letter files, work experience,
  education, skills and summary, eligibility and preferences, voluntary self-identification,
  custom answers, settings, application log, JSON import/export and delete-all.
- Floating **Auto-Fill** button on detected application pages, toolbar popup, and the
  Alt+Shift+F shortcut.
- Fill engine: shadow-DOM-aware scanner, rule-based classifier (~60 field types), fuzzy and
  negation-aware option matching, numeric range matching, React-safe value setting, combobox and
  button-dropdown support, file upload via `DataTransfer`, "Add another" handling for work and
  education, resume-first flow, a second pass for conditional questions, and runs in every frame.
- Verification pass with red/amber/green outlines and a results panel linking to every empty field.
- ATS detection for Greenhouse, Lever, Workday, Ashby, SmartRecruiters, iCIMS, Jobvite, BambooHR,
  Workable, Taleo, SuccessFactors, Breezy, JazzHR, Recruitee, Rippling, Teamtailor, Personio and
  Oracle, including embedded iframes.
- Demo forms, unit and integration tests (Vitest + jsdom), and a real-Chrome e2e test (Puppeteer).
- CI, release packaging, CodeQL, Dependabot, issue/PR templates and SDLC documentation.

## Roadmap

- OCR for scanned resumes; legacy `.doc` support.
- Optional, bring-your-own-key AI drafts for free-text questions (opt-in, never automatic).
- Multiple profiles (for example different resumes per role type).
- Per-site learning: remember answers the user corrects after a fill.
- Firefox and Edge packaging.

[Unreleased]: https://github.com/philliphjhuang/jobfill/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/philliphjhuang/jobfill/releases/tag/v1.0.0
