# StrangePin: current technical status

Last updated: 2026-10-23 (Europe/Lisbon). This file is the single source of truth for what is
live. Older reports in this repository (`RELEASE-CANDIDATE.md`, `CHANGES.md`,
`docs/firebase-security-audit.md`, `docs/firebase-compat-matrix.md`, `docs/perf-lcp.md`) are
kept as historical records; where they describe branches, plans or "not deployed" states,
this file wins.

## Live in production

| Item | State |
|---|---|
| Firestore security rules v3 (`firestore.rules`) | **Live.** Merged to `main` via PR #3; published to project `strangepin-4e538` by the owner. Unauthenticated REST probes after each deploy: `publicProfiles` and `pins` list allowed; `users`, `submissions`, `pointAwards`, `deletionRequests` and unlisted collections denied (403). |
| PR #1: technical release (v3 client, SEO pin pages, PWA, map fallback chain, security headers, CI) | **Deployed** (merged 2026-10-22). |
| PR #2: sourced content corrections for 23 pins | **Deployed** (merged 2026-10-23). |
| Netlify build | `netlify.toml` runs `node scripts/build-pins.js --out dist` plus `tests/sitemap-check.js` and publishes **`dist`** (99 `/pins/<slug>/` pages, `/pins/`, `sitemap.xml` with 101 URLs). Repository files such as `firestore.rules`, `docs/`, `tests/` and `scripts/` are no longer served. |
| Deploy order (rules v3 → PR #1 → PR #2) | **Done.** |
| Existing user data | Preserved. The owner confirmed Google sign-in on iPhone after the PR #1 deploy with her points (25), pins (2) and nickname intact. |

## Points model (manual, admin only)

- Visitors cannot award points to themselves; `firestore.rules` denies every client write to
  `points`, `pins`, roles and `pointAwards`.
- A signed-in visitor's location submission is stored as `submissions/{id}` with
  `status: 'pending'`.
- The owner reviews it with `scripts/admin-review-submission.js` (`list`, then `approve` or
  `reject`, dry run by default, `--write` to apply). Default award: +10 points and +1 pin per
  approved location, +5 points if it came with a photo. Each decision writes the submission
  review fields, a `pointAwards` ledger entry and the user's totals in one transaction. See
  `docs/admin-review.md`.
- The admin script needs an owner-held service account. Creating that credential and running
  any script against production (including dry runs) each need a separate, explicit approval.
  No paid plan or Cloud Functions are used.

## Deferred until the owner is back in Los Angeles

- **EmailJS dashboard hardening:** hard-code the template's "To Email", set allowed origins
  and a rate limit, add `{{submission_id}}` to the template.
- **Live e-mail test:** a real submission arriving at the notification inbox.
- Until then the client keeps sending the fixed `to_email` constant (not user-controllable) for
  compatibility with the current template. See `docs/third-party-hardening.md`.

## Still to do (each needs the owner's approval; none is started)

- **Firebase App Check** (reCAPTCHA v3/Enterprise): monitoring mode first, then enforce.
- **API key restrictions** for the public Firebase web key (HTTP referrers and API list).
- **Cloudinary unsigned upload preset limits** (formats, size, folder, moderation).
- **CSP enforcement:** the policy in `_headers` is still `Content-Security-Policy-Report-Only`.
- Optional: 301 from `strangepin.netlify.app` to `strangepin.com`; Firebase Auth e-mail
  enumeration protection and authorized-domain review.

## CI

- One workflow, `.github/workflows/ci.yml`, runs on `pull_request`. Its job `tests` is the
  check required by the `main` ruleset. It runs the unit, SEO/build, browser, Firestore rules v3
  (197 cases), admin-script, compatibility-matrix, emulator e2e, regression and expired-rules
  suites. All Firebase tests use the local emulators with the `demo-strangepin` project and
  never reach production.
- `network-tests (informational)` is optional (third-party hosts).
- The earlier rules-only workflow (`rules-ci.yml`, added with PR #3) duplicated the `tests`
  check name and was removed; `ci.yml` already runs `tests/rules.test.js`.
- GitHub Actions never deploy; Netlify builds `main` on its own.

## Rollback

- **Site:** Netlify → Deploys → previous deploy → "Publish deploy", or revert the merge commit
  on `main` with a normal PR (`git revert -m 1 <merge sha>`). No force pushes.
- **Rules:** Firebase console → Firestore → Rules → history → previous version → Publish. Never
  restore open test mode or extend its expiry. Roll back rules before (or together with) the
  client.
