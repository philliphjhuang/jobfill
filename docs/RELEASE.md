# Release Process

## Versioning

[Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

- **PATCH** — bug fixes, new classifier rules/synonyms, new ATS hints.
- **MINOR** — new user-facing features or profile fields (with a storage migration that keeps old
  data working).
- **MAJOR** — breaking changes to stored data or permissions.

`package.json` is the single source of truth; the build writes the version into `manifest.json`.

## Branching

- `main` is always releasable and protected: PRs only, CI must pass, one approving review.
- Work happens on short-lived branches: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org) so the changelog is
  easy to write (`feat: fill pronoun fields`, `fix(workday): month inputs`).

## Cutting a release

1. Make sure `main` is green and the manual checklist in [TEST_PLAN.md](TEST_PLAN.md) passes.
2. Move the entries under **Unreleased** in `CHANGELOG.md` to a new version heading.
3. Bump the version: `npm version minor` (or `patch`/`major`) — this commits and tags `vX.Y.Z`.
4. `git push --follow-tags`.
5. The **Release** workflow builds, tests, packages `jobfill-vX.Y.Z.zip` and attaches it to a
   GitHub Release with the changelog notes.

## Publishing to the Chrome Web Store

1. Download the zip from the GitHub Release (or run `npm run package`).
2. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   upload the zip to the existing item (first time: create a new item; one-time $5 developer fee).
3. Store listing: description from README, screenshots from `docs/images/`, category
   _Productivity_.
4. Privacy practices tab:
   - Single purpose: "Fill job application forms with the user's saved profile."
   - Permission justifications:
     - `storage`, `unlimitedStorage` — save the profile and resume file locally.
     - `scripting`, `activeTab` — run the filler in every frame of the current tab on request.
     - Host permissions (`http://*/*`, `https://*/*`) — application forms are hosted on thousands
       of employer and ATS domains; the content script needs to detect and fill them.
   - Data usage: personally identifiable information and documents are handled **only locally**,
     not collected or transmitted. Link to `PRIVACY.md`.
   - Remote code: none.
5. Submit for review. After approval, verify the published build on a live application.

## Hotfixes

Branch from the release tag (`fix/…`), add a regression test, release a PATCH version the same
way. Chrome auto-updates installed extensions within hours of approval.

## Rollback

Re-upload the previous release zip with a higher PATCH version (the Web Store does not allow
lower versions).
