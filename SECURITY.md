# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private vulnerability reporting
(**Security → Report a vulnerability** on the repository) or email the maintainer at
philliphjhuang@gmail.com with:

- a description of the issue and its impact,
- steps or a proof-of-concept page to reproduce it,
- the JobFill version and Chrome version.

You will get an acknowledgement within 3 days and a fix or mitigation plan within 14 days for
confirmed issues. Reporters are credited in the release notes if they wish.

## Threat model (summary)

| Surface                    | Risk                                                      | Mitigation                                                                                                                    |
| -------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Untrusted page DOM         | Labels containing markup injected into extension UI (XSS) | All UI text via text nodes (`h()` helper); ESLint bans `innerHTML`; unit test proves it.                                      |
| Page scripts               | A page reading the stored profile                         | Only values the user chose to fill are written to the page. The profile is never exposed to page JavaScript (isolated world). |
| Unintended form submission | Clicking "Add" buttons that default to `type=submit`      | `withSubmitGuard` cancels submit events while JobFill clicks.                                                                 |
| Stored data                | Sensitive PII (EEO answers, resume) at rest               | `chrome.storage.local` only (per Chrome profile, not synced); "Delete all my data" in the editor.                             |
| Imported JSON              | Crafted file with unexpected keys or types                | `mergeWithDefaults` whitelists keys and types.                                                                                |
| Supply chain               | Compromised dev dependency                                | Zero runtime dependencies in the bundle; committed lockfile; Dependabot; CodeQL.                                              |
| Extension permissions      | Broad host access                                         | No network code; the content script is passive until the user clicks Auto-Fill.                                               |
