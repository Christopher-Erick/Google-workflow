# Contributing

This repository is maintained for the Nazarene SHE document workflow.

## Standards

- Treat this as production organisational software: clear commits, documented behaviour, no secrets in git.
- Prefer small, reviewable changes over large mixed commits.
- Update `CHANGELOG.md` for user-visible behaviour changes.
- Keep approval rules in `Config.gs` (`DOC_TYPES`) as the single source of truth; update docs when chains change.
- Do not commit `.clasp.json`, credentials, personal emails used in production, or API keys.

## Branching

- `master` — stable deployable source
- Feature work: `feature/<short-name>` or `fix/<short-name>`

## Pull requests

Include:

1. What changed and why
2. How you tested (deploy preview / Apps Script editor / checklist in `docs/DEPLOY.md`)
3. Any doc updates (`README`, `docs/*`, `CHANGELOG`)

## Code style

- Apps Script: `var` + ES5-friendly patterns in `.gs` (V8 runtime is enabled; avoid optional chaining in shared paths if unsure)
- Private helpers end with `_`
- Client API functions are `api*` in `Code.gs` and return `{ ok, data }` or `{ ok: false, error }`
- HTML/CSS/JS stay in `Index.html`, `Styles.html`, `JavaScript.html`

## Security

Read [docs/SECURITY.md](docs/SECURITY.md) before changing auth, Drive access, or notification code.
