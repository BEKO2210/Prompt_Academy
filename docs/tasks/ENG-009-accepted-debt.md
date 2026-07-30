# ENG-009 — Clear the debt ENG-003 recorded

**Type:** Cleanup
**Milestone:** M6 (Hardening) — or opportunistically earlier
**Status:** PLANNED
**Complexity:** M

## Problem

ENG-003 introduced CI and, in doing so, surfaced pre-existing violations. They were **recorded and
accepted** rather than fixed, because fixing them means changing app logic and dataset content in a
repo that had zero tests until that ticket — a refactor with real regression risk, in the very ticket
whose job was to build the safety net.

The net is now in place. This ticket pays the debt down.

## Scope

### 1. Five eslint violations (currently downgraded to `warn`)

`site/eslint.config.js` downgrades two rules. Restore both to `error` after fixing:

| Rule | Location |
|---|---|
| `react-hooks/set-state-in-effect` | `Counter.tsx:34`, `Navbar.tsx:33`, `PromptDrawer.tsx:47`, `Library.tsx:89` |
| `react-refresh/only-export-components` | `ExplorerControls.tsx:20` |

Notes per site:

- `Navbar.tsx:33` — `useEffect(() => setOpen(false), [pathname])`. Closing the mobile sheet on
  navigation. Candidate: derive from the route, or key the component on `pathname`.
- `Library.tsx:89` — `useEffect(() => setVisible(PAGE), [filters, q, sort])`. Resetting the paging
  window when the result set changes. Candidate: a `key` on the grid, or derive `visible` from a
  reset token. **Touches the search path — coordinate with ENG-006 rather than doing both blind.**
- `PromptDrawer.tsx:47` — resetting `full`/`loading` when the selected item changes, before a fetch.
  Candidate: key the drawer on `item.id`.
- `Counter.tsx:34` — `setVal(to)` under `prefers-reduced-motion`. Smallest of the five.
- `ExplorerControls.tsx:20` — exports `EMPTY_FILTERS` and types alongside components. Fix by moving
  the constant and types to a sibling module.

**Each of these works today.** They are React best-practice violations flagged by a strict
`eslint-plugin-react-hooks` v7, not live bugs. Fix them for maintainability, and do it with the
`npm test` suite green before and after — the whole point of having waited.

### 2. Ten slug-pattern violations

Ten slugs violate `schema/prompt.schema.json`'s own pattern `^[a-z0-9]+(-[a-z0-9]+)*$`:

| id | slug | problem |
|---|---|---|
| PRM-003047 | `product-page-with-q&a-section` | `&` |
| PRM-003488 | `marketplace-with-seller-q&a` | `&` |
| PRM-006128 | `live-q&a-session-interface-127` | `&` |
| PRM-006786 | `instructor-student-q&a-785` | `&` |
| PRM-003197 | `filter-with-view-toggle-grid/list` | `/` |
| PRM-006436 | `ci/cd-pipeline-visualizer-435` | `/` |
| PRM-006619 | `comptia-a+-practice-lab-618` | `+` |
| PRM-004820 | `bespoke--ats-friendly-cv-site-4820` | `--` |
| PRM-004840 | `purpose-driven--ats-friendly-cv-site-4840` | `--` |
| PRM-008387 | `-archaeological-expedition` | leading `-`, looks truncated |

**Why this went unnoticed:** `scripts/validate_dataset.py` checks slug **uniqueness only** and never
the pattern. So `reports/quality_report.md`'s "Schema valid: YES" does not cover slugs. Fixing the
data should come with fixing that gap in the validator, or the same class of defect returns.

**No live impact today** — slugs are carried in the index and displayed, but are not used for
routing. They break the moment slugs become URL segments, which is the obvious next use.

Replacement text is a content decision worth a human look, not a blind transform:
`&` → `and`? `+` → `plus`? `/` → `-`? And `PRM-008387` needs its lost leading word recovered, not
just its hyphen stripped.

Constraints:
- Slug uniqueness must hold after any rewrite.
- `content_hash` is unaffected: `slug` is deliberately excluded from the hash (ADR-0007 — identity,
  not content), so renaming slugs does not read as a content change. Verify, do not assume.
- `tests/dataset.test.mjs` keeps a `KNOWN_BAD_SLUGS` allowlist plus a staleness test, so removing an
  id from the list is *required* once fixed — the allowlist can only shrink.

### 3. Close the validator gap

Add slug-pattern checking to `scripts/validate_dataset.py` so its PASS actually means schema-valid.
Then `tests/dataset.test.mjs` can drop the allowlist entirely and assert the pattern directly.

## Non-Goals

- Rewriting the effect logic in a way that changes behaviour. These are refactors, not features.
- Touching `Library.tsx` search behaviour — that is ENG-006/D3.

## Acceptance criteria

- [ ] `react-hooks/set-state-in-effect` and `react-refresh/only-export-components` back to `error`,
      and `npm run lint` passes with **0 warnings**.
- [ ] `npm test` green before and after; behaviour verified unchanged in the running app
      (`scripts/baseline/` for the measurable parts).
- [ ] Ten slugs valid against the schema pattern; uniqueness preserved.
- [ ] `KNOWN_BAD_SLUGS` emptied and the allowlist tests replaced by a direct pattern assertion.
- [ ] `validate_dataset.py` checks the slug pattern, and fails on a deliberately invalid slug (proven,
      not assumed).
- [ ] `content_hash` manifest unchanged by the slug rename — confirming the ADR-0007 exclusion holds.

## Risks

- Effect refactors are exactly where React regressions hide, and much of this UI has no test
  coverage beyond the dataset/build layer. Prefer keying components over restructuring state.
- Slug changes are user-visible if slugs ever reach URLs; if any are already shared externally, a
  redirect story is needed. Currently they are not routed, so now is the cheap moment.
