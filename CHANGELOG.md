# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

- Parse an uploaded resume to pre-fill the profile.
- Optional, bring-your-own-key AI drafts for free-text questions (opt-in, never automatic).
- Multiple profiles (for example different resumes per role type).
- Per-site learning: remember answers the user corrects after a fill.
- Firefox and Edge packaging.

[Unreleased]: https://github.com/OWNER/jobfill/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/OWNER/jobfill/releases/tag/v1.0.0
