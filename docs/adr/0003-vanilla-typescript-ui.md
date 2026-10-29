# ADR 0003 — Vanilla TypeScript UI and esbuild instead of a framework

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

The extension has three small UIs (popup, profile editor, in-page panel). The in-page panel is
injected into every job site, where bundle size and isolation matter.

## Decision

Build UIs with a ~50-line `h()` DOM helper and a schema-driven form renderer; bundle with esbuild
into IIFE scripts (MV3 content scripts cannot be ES modules).

## Consequences

- ✅ No UI framework at runtime; content script ≈ 80 KB minified; sub-second builds. (The only
  runtime dependency, pdf.js, is confined to the profile editor — see
  [ADR 0004](0004-local-resume-parsing-with-pdfjs.md).)
- ✅ The `h()` helper only creates text nodes, which makes XSS-safe rendering the default.
- ❌ More manual DOM code than React/Preact would need. If the editor grows substantially,
  revisit with Preact (small, same JSX model).
