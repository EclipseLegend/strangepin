# Branch protection for `main` (settings to apply by the owner)

Status: a ruleset (id 25582805) is active on `main` and requires the status check `tests`.
This document was written before it existed and is kept as the reference for its settings;
the agent does not change branch protection. Apply or review in GitHub → repository → Settings → Branches → "Add branch protection
rule" (classic) or Settings → Rules → Rulesets → "New branch ruleset" (recommended).

## Ruleset (recommended form)

| Setting | Value |
|---|---|
| Ruleset name | `main protection` |
| Enforcement status | **Active** |
| Target branches | Include default branch (`main`) |
| Bypass list | **Empty** (see "Admins" below) |
| Restrict deletions | **On** |
| Block force pushes | **On** (classic: leave "Allow force pushes" **off**) |
| Require linear history | Optional (On if you only squash/rebase-merge) |
| Require a pull request before merging | **On** |
| → Required approvals | **0** |
| → Dismiss stale approvals on new commits | On (harmless with 0 approvals) |
| → Require conversation resolution | On |
| Require status checks to pass | **On** |
| → Require branches to be up to date before merging | On |
| → Status checks that are required | **`tests`** (job `tests` in `.github/workflows/ci.yml`, workflow "CI"). Do **not** add `network-tests (informational)`; it depends on third-party hosts and is `continue-on-error`. |
| Block direct pushes | Implied by "Require a pull request" (classic: also tick "Do not allow bypassing the above settings") |

Classic branch-protection equivalents: "Require a pull request before merging" (approvals 0),
"Require status checks to pass before merging" + "Require branches to be up to date" with
`tests`, "Require conversation resolution", "Do not allow bypassing the above settings",
"Allow force pushes" off, "Allow deletions" off.

The `tests` check only appears in the picker after the workflow has run once on a pull
request (EXPECTED GitHub behaviour), so open the first PR, let CI run, then select it.

## What this does and does not protect (read this)

- **Admins can bypass** unless "Do not allow bypassing the above settings" (classic) is set or
  the ruleset bypass list is empty. Repository admins/owners can also simply edit or disable
  the rule; protection is a guard rail against accidents, not against the owner.
- **0 required approvals does not technically stop anyone with write access — including the
  owner and any agent/token acting for the owner — from opening a PR and merging it
  themselves** as soon as `tests` is green. The safeguard against unreviewed merges is
  **procedural**: the agreed process is "agent prepares the PR, owner reviews and clicks
  merge". If a technical guarantee is wanted, require 1 approval and add a second
  account/collaborator as reviewer (the PR author cannot approve their own PR).
- A required status check only proves the headless suites passed in CI. It does not prove
  production works (no real Firebase/Netlify in CI).
- Workflow changes in a PR run with the PR's own `ci.yml`; a PR could weaken the checks.
  Review changes to `.github/workflows/` explicitly (optionally add a CODEOWNERS entry plus
  "Require review from Code Owners" once a second reviewer exists).

## CI workflow facts (`.github/workflows/ci.yml`)

- Triggers: `pull_request` (all branches) and manual `workflow_dispatch`. No `push` trigger,
  no `pull_request_target` (so fork PRs never get a privileged token).
- `permissions: contents: read`; `actions/checkout` with `persist-credentials: false`; **no
  secrets** referenced.
- Job `tests` (required): helpers, static-hero sync check, SEO build + sitemap check +
  html-validate, browser smoke, detail sections, PWA installability, map fallback chain, PWA
  offline, then Firestore/Auth emulators (`demo-strangepin`) for rules v3 (197), admin scripts
  (34), the compatibility matrix, the UI e2e (46) and regression (20), and finally the
  expired-rules suites (56 denied operations, 16 UI checks).
- `ci.yml` is the only workflow that reports `tests`. The rules-only `rules-ci.yml` (PR #3)
  also reported a job named `tests` and was removed as a duplicate.
- Job `network-tests (informational)`: perf-lazy (Google Translate) and CSP report-only
  (Translate, OpenFreeMap). Not required.
- Actions are pinned to major tags (`@v4`). For stricter supply-chain hygiene, pin to full
  commit SHAs and let Dependabot update them.
