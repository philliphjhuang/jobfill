# ADR 0001 — Store all user data locally, no backend

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

An autofill tool holds some of the most sensitive data a person has: contact details, work
history, resume, and voluntary demographic answers (race, disability, veteran status). Hosted
competitors sync this to their servers. The primary user explicitly asked for the information to
be stored locally.

## Decision

Keep everything in `chrome.storage.local` (with `unlimitedStorage` for resume files). There is no
account system, no server and no network code in the extension. Backup and transfer between
machines is done with a user-initiated JSON export/import.

## Consequences

- ✅ Strong privacy story, simple Chrome Web Store privacy disclosure, nothing to operate or pay for.
- ✅ Works offline; no latency.
- ❌ No automatic sync across devices (mitigated by export/import; `chrome.storage.sync` is too
  small for resumes).
- ❌ No server-side AI answer generation; free-text questions are flagged for the user instead.
  If added later it must be opt-in with the user's own API key (see roadmap in CHANGELOG).
