# How JobFill covers the Software Development Life Cycle

Each SDLC phase maps to concrete artifacts in this repository. Use it as a checklist when you
extend the project.

| Phase                       | What it means here                                                       | Artifacts                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Planning                 | Problem, goals, scope, success criteria                                  | [REQUIREMENTS.md §1–2](REQUIREMENTS.md), roadmap in [CHANGELOG.md](../CHANGELOG.md#roadmap)                                                                    |
| 2. Requirements analysis    | User stories, functional & non-functional requirements, acceptance       | [REQUIREMENTS.md §3–6](REQUIREMENTS.md)                                                                                                                        |
| 3. Design                   | Architecture, data model, sequence of a fill, security design, decisions | [ARCHITECTURE.md](ARCHITECTURE.md), [ADRs](adr/), `src/shared/types.ts`                                                                                        |
| 4. Implementation           | Code with enforced standards                                             | `src/`, strict `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`, [CONTRIBUTING.md](../CONTRIBUTING.md), `.githooks/pre-commit`         |
| 5. Testing / verification   | Unit, integration, e2e, coverage gates, manual checklist, traceability   | [TEST_PLAN.md](TEST_PLAN.md), `tests/`, `demo/`, `vitest.config.ts` thresholds                                                                                 |
| 6. Security review          | Threat surfaces, safe rendering, dependency & code scanning              | [SECURITY.md](../SECURITY.md), [PRIVACY.md](../PRIVACY.md), ESLint `innerHTML` ban, CodeQL + Dependabot workflows                                              |
| 7. Build & integration (CI) | Reproducible builds and automated checks on every change                 | `scripts/build.mjs`, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), `npm run check`                                                                |
| 8. Release & deployment     | Versioning, packaging, store submission                                  | [RELEASE.md](RELEASE.md), `scripts/package.mjs`, [`.github/workflows/release.yml`](../.github/workflows/release.yml), `CHANGELOG.md`                           |
| 9. Operation & maintenance  | Bug intake, site-support requests, dependency updates, migrations        | [Issue templates](../.github/ISSUE_TEMPLATE/), PR template, `dependabot.yml`, `mergeWithDefaults` storage migration, application log for user-side diagnostics |
| 10. Feedback / iteration    | Turning field reports into rules and tests                               | "Site not filling correctly" template → new rule in `rules.ts` + case in `classifier.test.ts` or fixture in `demo/`                                            |

## Definition of done (per change)

- [ ] Requirement or issue linked in the PR.
- [ ] Tests added/updated; `npm run check` passes locally and in CI.
- [ ] Docs updated if behaviour, permissions or data model changed.
- [ ] `CHANGELOG.md` entry under **Unreleased**.
- [ ] For data-model changes: old stored data still loads (migration covered by a test).
