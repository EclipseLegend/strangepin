# Proposal: replace the blanket `verified` flag and the placeholder counts

**Status:** this is a proposal only. No data was changed or deleted. Evidence was gathered on 2026-10-21 from the inline `LOCATIONS` array in `index.html`.

## The problem (TESTED by reading the data)

**The `verified` flag is not meaningful.**
- All 99 pins have `verified:true` (`grep -c "verified:true" index.html` → 99).
- It is shown as a green "✓" badge on cards (`index.html` around line 4889) and as a "Verified" badge in the pin hero (around line 5136).
- Yet:
  - most pins have no sources at all;
  - several pins contain errors that are already documented (see `docs/content-corrections.md`);
  - the site's own disclaimer says the stories are "not verified facts".

**The counts are placeholders.**
- `reports`, `mysteryScore` and `intensityAvg` take only a few distinct values: for example `reports` is 280, 160 or 90, paired with scores 9.5, 8.5 or 7.5.
- They do not come from user activity.
- They are still shown as "N reports", "⚡ score", "🔥 trending" and in Quick Facts, and they drive the "Trending" sort.

**The marketing copy overclaims.** The hero says "Real locations. Verified facts." The "What We Know" label says "Verified facts & confirmed history".

## Proposed model (additive and non-destructive)

Keep every existing field so nothing is lost, and add the fields below. The UI reads the new fields and only falls back to the old ones where that is safe.

```js
review: {
  status: 'unreviewed',      // 'unreviewed' | 'sourced' | 'editor-reviewed' | 'disputed' | 'legend'
  reviewedAt: null,          // ISO date of the last editorial check, e.g. '2026-10-21'
  reviewer: null,            // editor handle (not an email)
  notes: ''                  // internal; never rendered
},
metrics: {
  source: 'placeholder',     // 'placeholder' | 'live'
  // live values come from Firestore aggregation later (comments, reactions, saves)
}
```

### Display rules
| Condition | Badge shown | Wording |
|---|---|---|
| `review.status === 'editor-reviewed'` and ≥1 source with a valid https URL | green ✓ | "Reviewed {reviewedAt}" |
| `review.status === 'sourced'` (≥1 cited source, not yet editor-checked) | neutral | "Sources cited" |
| `review.status === 'disputed'`, or `contentFlags` includes `Disputed Claim` | amber | "Disputed" |
| `review.status === 'legend'`, or `contentFlags` includes `Legend Only` | purple | "Folklore" |
| `unreviewed` (default) | none | — |

- **Placeholder metrics** (`metrics.source === 'placeholder'`):
  - hide the "N reports" and trending pills;
  - label the score as "Editor's mystery rating" (it is an editorial judgement, not a measurement), or hide it until it is defined.
  - "Trending" falls back to `featured` order instead of sorting by placeholder `reports`.
- **Live metrics:** once a Cloud Function or scheduled aggregation writes real counts into a public `pinStats/{pinId}` doc, set `metrics.source = 'live'` and show the counts again.

### Migration (no data loss)
1. Add the `review` and `metrics` objects to every pin.
   - Set `status: 'sourced'` only where `sources` has at least one entry; that is pins 001–010 today (EXPECTED, from the data dump).
   - Every other pin gets `status: 'unreviewed'`.
2. Leave `verified:true` in the data, but stop reading it in the UI. It can be removed later, after an owner-approved cleanup.
3. Copy changes for the owner to approve:
   - Hero: "Real locations. Verified facts. Unexplained stories." → "Real places. Documented history. Unexplained stories."
   - "What We Know" sub-label: "Verified facts & confirmed history" → "Documented history (see sources)".
4. Editorial workflow: pins move to `editor-reviewed` only after each claim in "What We Know" has a source in `sources`. `docs/content-corrections.md` is the work log.

### Implementation sketch (EXPECTED; not implemented in this branch)
- **Card badge:** `const b = spTrustBadge(loc)`, a pure function of `loc.review`, `loc.sources` and `loc.contentFlags`, unit-tested in `tests/helpers.test.js`.
- **Placeholder guard:** `spHasLiveMetrics(loc)` guards the reports/score/trending UI.
- **Search engines:** JSON-LD (see `docs/seo-url-plan.md`) must not emit review/rating markup (`aggregateRating`) from placeholder data.
