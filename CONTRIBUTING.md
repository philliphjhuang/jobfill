# Contributing to JobFill

Thanks for helping! The most valuable contributions are usually small: a question JobFill
doesn't recognise, a dropdown it can't open, or a site where the button doesn't appear.

## Setup

```bash
npm ci
npm run dev        # rebuilds dist/ on change
# chrome://extensions → Developer mode → Load unpacked → dist/
npm run demo       # mock forms at http://localhost:5173
```

Optional: enable the pre-commit hook (typecheck + lint + tests before each commit):

```bash
git config core.hooksPath .githooks
```

## Workflow

1. Open or pick an issue. For new sites use the **Site not filling correctly** template and
   include the relevant HTML (remove personal data).
2. Branch from `main`: `feat/…`, `fix/…`, `docs/…`.
3. Write a failing test first, then the fix.
4. `npm run check` must pass.
5. Open a PR using the template; use a [Conventional Commit](https://www.conventionalcommits.org)
   title (`fix(classifier): recognise "Given name"`).

## Common changes

### Teach JobFill a new question

1. Add or extend a rule in `src/engine/rules.ts`. Rules are regexes over the normalized label
   (lower-case, punctuation → spaces). Use `not` for exclusions, `kinds` to restrict control
   types, `sections` / `notSections` for work/education context, `priority` to break ties.
2. If it needs new data, add the field to `src/shared/types.ts`, `defaults.ts`, the editor
   schema in `src/options/schema.ts`, and a case in `src/engine/resolver.ts`.
3. Add cases to `tests/unit/classifier.test.ts` (and `resolver.test.ts` if applicable).

### New answer wording (e.g. a new "decline" phrase)

Add it to the lists in `src/engine/synonyms.ts` and a case to `tests/unit/text-and-matcher.test.ts`.

### A custom dropdown/widget doesn't work

Reproduce it in `demo/` (add behaviour to `demo/widgets.js` if needed), add assertions to
`tests/integration/demo-forms.test.ts`, then adjust `findListboxOptions` / `comboboxValue`.

### A new ATS

Add an entry to `ADAPTERS` in `src/engine/ats.ts` (host regex, optional embed regex, optional
selector hints) and a detection case in `tests/unit/fillers-and-entries.test.ts`.

## Code style

- Strict TypeScript, no `any` unless unavoidable (warned by lint).
- Never use `innerHTML` in `src/` — build DOM with `h()` from `src/ui/h.ts`. Page text is untrusted.
- The engine must not call `chrome.*`; keep it pure DOM so it stays testable.
- Formatting is Prettier's; don't hand-format.

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
