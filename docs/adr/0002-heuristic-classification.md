# ADR 0002 — Rule-based field classification with site hints as an overlay

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

Application forms differ per ATS and per employer. Options considered:

1. **Per-site scripts** (hard-coded selectors for each ATS) — precise but brittle; breaks on every
   redesign and does nothing for the long tail of custom careers pages.
2. **Machine-learning classifier** — adaptive, but needs a labelled dataset, adds model weight to
   the extension and is hard to debug when it picks the wrong answer.
3. **Declarative heuristics** — regex rules scored over multiple signals (label, ARIA, placeholder,
   attributes, autocomplete, section heading, options) plus optional per-site selector hints.

## Decision

Use option 3. Rules live in one table (`src/engine/rules.ts`); each rule can be restricted by
control kind and section and carries a priority. Site adapters (`src/engine/ats.ts`) only add
high-confidence hints on top. The demo-form integration tests run without hints so the generic
path is always exercised.

## Consequences

- ✅ Works on unknown sites; new questions are usually a one-line rule plus a test case.
- ✅ Fully explainable: every report entry records the classified type and why a value was or
  wasn't used.
- ❌ Regexes can collide; mitigated with negative patterns, priorities, section gating and a
  ~80-case classifier test table.
