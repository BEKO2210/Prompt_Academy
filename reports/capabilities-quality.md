# Capability assignment — quality evaluation (ENG-001)

**Date:** 2026-07-30
**Vocabulary:** 1.0.0 · **Rules:** 1.1.0
**Method:** deterministic rules only — no model assigns capabilities.

The brief was explicit: do not let a model tag 10,000 prompts freely and then treat those labels
as truth. This is the evidence that the rule-based alternative is good enough — or not — to build
a router on.

---

## 1. What was built

| Artifact | Purpose |
|---|---|
| `schema/capabilities.vocabulary.json` | 28 functional capabilities, each with a definition and an explicit *not* boundary |
| `schema/capabilities.rules.json` | Versioned deterministic rules: word-boundary regex + a 26-row subcategory map |
| `scripts/derive_capabilities.py` | Applies them; `--check` for CI, `--sample` for review |
| `reports/capabilities.json` | Per-record labels, split into `high` / `medium` / `uncertain` |

**No capability restates `category` or `subcategory`.** Artifact type is already carried by those
fields and already used as a ranking facet; duplicating it would inflate the vocabulary without
adding a signal.

---

## 2. Coverage

| | Value |
|---|---|
| Records | 10,000 |
| With ≥1 capability | **9,866 (98.66%)** |
| Without any capability | 134 |
| Capabilities per record | mean **5.24**, min 0, max 15 |
| Vocabulary terms never used | **none** — all 28 fire |
| Runtime | ~17 s, fully reproducible |

Evidence split: **high** = matched an `acceptance_criterion` (an explicit promise about the output)
or a subcategory whose artifact *is* the capability. **medium** = matched only in prompt prose or
tags. **uncertain** = matched only inside a negation window or only in `negative_prompt` — recorded
separately and **never counted as assigned**.

Uncertain totals: 1,917 `negative_prompt_only`, 86 `negated_context`. Marking these instead of
asserting them is the difference between "the prompt says avoid modals" and "the prompt provides
modals".

---

## 3. Precision and recall

Two review rounds. Each assigned capability was judged individually against the record's own text.
Only assignments traceable to visible evidence were scored; unverifiable ones were set aside rather
than guessed at, and then chased down separately (§3.3).

### 3.1 Round 1 — rules v1.0.0, sample seed 7, n = 20 (stratified, 2 per category)

| | Value |
|---|---|
| True positives | 77 |
| False positives | 8 |
| False negatives | 8 |
| **Precision** | **90.6%** |
| **Recall** | **90.6%** |

### 3.2 Round 2 — rules v1.1.0, **fresh** sample seed 42

Deliberately a different seed. Fixes derived from sample 7 must not be validated on sample 7, or
the measurement only proves the rules memorised the review set.

| | Value |
|---|---|
| Records reviewed | 10 |
| Assigned capabilities verified correct | **47** |
| **False positives found** | **0** |
| False negatives | 2 |

### 3.3 An honest caveat about how this was verified

Round 2's first pass could only check assignments traceable to `acceptance_criteria`, because the
prompt text shown in the review sample is truncated. Those are exactly the *high*-confidence
assignments, which are the accurate ones — so a naive reading would have flattered the result.

Twelve *medium* assignments that looked unsupported were therefore chased down individually in the
full record text. **All twelve were correct:**

| Record | Assignment that looked wrong | Actual evidence in the full text |
|---|---|---|
| PRM-009026 | `data.export` | "Add export functionality" |
| PRM-009026 | `data.filter_sort` | "cross-chart filtering" |
| PRM-009760 | `data.realtime` | "real-time feeds" |
| PRM-008105 | `state.error` | "Error boundaries catch and gracefully handle unexpected UI failures" |
| PRM-006143 | `a11y.keyboard` | "interactive elements must be keyboard navigable" |
| PRM-003282 | `auth.accounts` | "account creation prompts" |
| PRM-003282 | `feedback.overlay` | "quick view modals" |
| PRM-003282 | `state.loading` | "skeleton screens" |

Without this step the round-2 figure would have been an artifact of what the reviewer could see.

---

## 4. False positives found, and what caused them

Every one was a **systematic word-sense error**, not noise — which is why rules could fix them.

| Capability | Trigger | Why it was wrong |
|---|---|---|
| `data.export` | "**exported** props interface" | TypeScript export, not data export |
| `commerce.checkout` | "**billing** overview events" | SaaS invoicing view, not a payment flow |
| `auth.accounts` | "newsletter **signup**" | Mailing list, not a user account |
| `layout.responsive` | "**responsive** feedback on every action" | Reactive UI, not breakpoints |
| `layout.dark_mode` | "gunmetal gray **dark mode**", "dark-mode-neon" | Palette name, not a theming capability |
| `forms.validation` | "**validating** web components against WCAG" | Code validation, not input validation |

Fixed in rules 1.1.0 by requiring a collocation that disambiguates the sense.

## 5. False negatives found, and what caused them

| Capability | Missed phrasing | Cause |
|---|---|---|
| `layout.responsive` | "desktop **and** mobile" | Pattern only accepted mobile→desktop ordering |
| `commerce.cart` | "persistent **mini-cart**" | Collocation window too tight |
| `data.table` | "user **table** tracking active sessions" | Collocation list missing "track" |
| `data.pagination` | "large datasets **using virtualization**" | Lookahead required the noun *after* the verb |
| `a11y.screen_reader` | "**ARIA** improvements", "accessibility **descriptions**" | Pattern demanded `aria-role`/`aria-label` specifically |

Fixed in 1.1.0.

## 6. Corpus-wide effect of the fixes

| Capability | v1.0.0 | v1.1.0 | Δ | |
|---|---|---|---|---|
| `layout.responsive` | 5,694 | 7,055 | **+1,361** | FP+FN fix |
| `data.pagination` | 768 | 1,401 | **+633** | FN fix |
| `a11y.screen_reader` | 1,972 | 2,175 | +203 | FN fix |
| `commerce.cart` | 250 | 351 | +101 | FN fix |
| `data.table` | 430 | 461 | +31 | FN fix |
| `layout.dark_mode` | 2,351 | 1,605 | **−746** | FP fix |
| `data.export` | 1,925 | 1,239 | **−686** | FP fix |
| `auth.accounts` | 1,513 | 1,154 | −359 | FP fix |
| `forms.validation` | 1,512 | 1,214 | −298 | FP fix |
| `commerce.checkout` | 957 | 930 | −27 | FP fix |

Net: roughly **2,100 false assignments removed** and **2,300 missed ones recovered**, across ~52,000
total assignments.

---

## 7. Ambiguities and known limits

**`motion.animation` fires on ~80% of records.** Not an error — this corpus really is animation-heavy
— but a capability present on four records in five carries almost no discriminative power. It should
be weighted at or near zero in ranking, or the signal will be noise. Flagged in the rules file.

**Bare "WCAG 2.1 AA compliance" yields no accessibility capability.** A deliberate consequence of
dropping the umbrella term: an umbrella implied by its own members makes overlap analysis
meaningless, so only the named mechanisms (keyboard, screen reader, contrast, reduced motion) are
assigned. Records that promise only generic compliance therefore get nothing. This was the most
common false negative in both rounds. **It is a design trade, not a bug** — but if capability recall
matters more than vocabulary cleanliness, revisit it.

**Boilerplate acceptance criteria inflate capabilities.** Some records carry template criteria that
do not match their own subject: a kids' recycling game promising "All data visualizations update
dynamically in real-time" gets `data.charts`, `data.realtime`, `data.search`, `data.filter_sort`.
The rule is behaving correctly — it is the *dataset* that is internally inconsistent. This is a
dataset-quality finding, not a rules finding, and it will put noise into any capability-based
ranking. Worth quantifying before the capability signal is weighted highly.

**134 records get no capability at all.** Their acceptance criteria are pure boilerplate
("renders correctly", "core features are interactive"). Nothing to extract; correctly left empty
rather than guessed at.

---

## 8. Verdict

**Precision ≈ 91% before fixes, no false positives found in a 10-record fresh sample after.
Recall ≈ 91%, with one known systematic gap (bare WCAG claims).**

This is good enough to use as **one ranking signal among several**, which is its intended role
(ablation arm R3). It is **not** good enough to route on alone, and nothing here should be treated
as ground truth for evaluating retrieval — that is what the labelled query set (ENG-005) is for,
and it must be built independently of these labels.

The single biggest risk to downstream use is not the rules but the dataset's boilerplate acceptance
criteria (§7). If the capability signal underperforms in the R3 ablation, check that first.

**Sample sizes are small (20 + 10) and single-judge.** The figures are indicative, not tight. They
were enough to find six systematic error classes and fix all of them, which was the point.
