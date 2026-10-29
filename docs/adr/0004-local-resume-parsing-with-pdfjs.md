# ADR 0004 — Parse resumes locally, using pdf.js for PDFs

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

Users want to set up their profile from their resume. Resumes are mostly PDFs (often exported from
Word, Google Docs or LaTeX) and DOCX files. Options:

1. **Cloud resume-parsing API** — good accuracy, but sends the most sensitive document the user
   has to a third party and contradicts [ADR 0001](0001-local-only-storage.md).
2. **Hand-written PDF text extractor** — no dependency, but real PDFs use compressed streams,
   embedded fonts, custom encodings and ToUnicode maps; a toy parser would fail on most of them.
3. **pdf.js in the extension page** — Mozilla's PDF engine, used by Firefox; robust text
   extraction with positions, runs offline.

For DOCX, the browser already provides everything needed (`DecompressionStream` for ZIP entries,
`DOMParser` for the XML), so no library is required.

## Decision

- Use `pdfjs-dist` **4.10.38** (the latest line whose Node engine range matches this project's
  Node 20 toolchain; it includes the fix for CVE-2024-4367). Bundle it only into the options page;
  ship its worker as a packaged file. Call it with `isEvalSupported: false`.
- DOCX: small in-house ZIP reader + `DecompressionStream('deflate-raw')` + `DOMParser`.
- Parsing and merging are pure functions with fixture-based tests; the review UI never replaces a
  non-empty field without an explicit Yes or Edit.

## Consequences

- ✅ The resume never leaves the device; works offline.
- ✅ Handles real-world PDFs, including right-aligned dates and link annotations.
- ❌ First runtime dependency (~380 KB in `options.js`, ~1 MB worker) — only loaded on the editor
  page, never injected into job sites.
- ❌ Minimum Chrome version raised to 120.
- ❌ Heuristic parsing is best-effort; unusual layouts (multi-column, tables for everything) may
  parse partially. The review step and the editor make that visible and fixable.
- ❌ Scanned (image-only) PDFs have no text; OCR is out of scope.
- 🔁 Revisit when upgrading to Node 22: move to the current pdf.js major.
