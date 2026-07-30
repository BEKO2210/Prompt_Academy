# Relevance guideline — retrieval ground truth (ENG-005)

**Written before any record was judged.** Fixed at ground-truth version
`retrieval-ground-truth-v1`. Changing it requires a version bump and a documented reason.

This document exists so that the labels are reproducible by someone else, and so that a later
disagreement can be settled by the rule rather than by re-litigating each case.

---

## 1. The question being answered

> **If a user typed this query into the Prompt Academy library, would this record be a good thing
> to hand them?**

That is a *retrieval* question. It is deliberately **not**:

- "is every sentence of this record useful?"
- "is this record well written?"
- "would injecting this record improve an LLM's output?"

The last one is H1 and is measured separately by ENG-008 with its own independent evaluation layer.
Mixing the two here would make both unmeasurable.

---

## 2. Grades

Graded, not binary, because `benchmark-plan.md` §4 already commits to **nDCG@10**, which needs
grades. Four levels, deliberately few:

| Grade | Meaning | Test to apply |
|---|---|---|
| **3** | Highly relevant | This record is *directly usable* as the prompt for the query's core intent. A user would stop searching here. |
| **2** | Relevant | Addresses the core intent but misses a stated secondary condition, or is a near-miss in artifact type. Useful, would be adapted. |
| **1** | Partially relevant | Related and plausibly worth seeing, but does not address the core intent. Would be scrolled past by a user who knows what they want. |
| **0** | Not relevant | Should not appear. Includes records that merely share a word, an industry, or a framework. |

**Grade 3 is scarce by design.** If a query has more than ~15 grade-3 records, the query is too
broad or the grading has drifted — flag it rather than accepting it.

---

## 3. What does NOT make a record relevant

A record is **not** relevant merely because:

- a single query word appears anywhere in its text
- it names the same **industry** (a "healthcare dashboard" is not relevant to "healthcare booking form")
- it names the same **framework** ("React" appears in ~25% of records; that is not a match)
- it applies the same **general UI principles** (responsive, accessible, animated — near-universal here)
- it shares a **category** with a relevant record

These are exactly the traps a lexical ranker falls into, so admitting them as relevant would make
the ground truth reward the failure mode it is meant to detect.

## 4. What the core intent is

Take the query's **head noun / artifact** and its **binding constraints**.

- `"accessible dashboard"` → artifact = dashboard, constraint = accessibility.
  A dashboard with no accessibility content is grade 1, not 2 — accessibility is binding.
- `"checkout with coupon support"` → artifact = checkout, constraint = coupons.
  A checkout without coupons is grade 2 (right artifact, missing the stated feature).
- `"e-commerce"` → artifact is the whole category; there is no binding constraint.
  Broad queries get many grade-2s and few grade-3s.

Where a query states a **prohibition** (`"landing page without animations"`), a record that
prominently features that thing is **grade 0**, not merely lower — it is actively wrong for the
user.

---

## 5. Judging the record as a whole

ENG-001 measured that this dataset's `acceptance_criteria` are sometimes **boilerplate that
contradicts the record's own subject** — a kids' recycling game promising "All data visualizations
update dynamically in real-time".

Therefore:

- Judge from the record's **actual task**, primarily `title` + `prompt` + `subcategory`.
- Do **not** grade on `acceptance_criteria` or `negative_prompt` alone.
- Do **not** consult `capabilities[]` or `reports/capabilities.json` at all (see §7).
- If the record is internally inconsistent, still grade it on its real task, and add the flag
  `internal_metadata_conflict`. Do not delete or repair it — that is a dataset question, not a
  ground-truth question.

---

## 6. Blinding

While judging, the annotator sees only: `id`, `title`, `category`, `subcategory`, `prompt`.

Deliberately **hidden**: which pooling source proposed the record, its position in any candidate
list, any retrieval score, and all capability labels. Candidates are presented **shuffled** by a
recorded seed.

This is what stops the ground truth from ratifying whatever the existing search already does.

## 7. The circularity ban

**Ground truth must never be derived from a retrieval method or from capability labels.**

Forbidden:
- run the existing search, accept its top-N as relevant
- select records whose `capabilities[]` match the query, call them relevant
- use a future ranker's output as labels

Capability labels are a *candidate ranking signal* to be tested later (ablation arm R3). If they
also defined relevance, R3 would be scoring itself. A test enforces this
(`tests/query-set.test.mjs`).

Retrieval methods **may** propose candidates. They may never assign a grade.

---

## 8. Zero-result queries

Some queries deliberately have **no** relevant record, because the corpus genuinely lacks the
content (ENG-010 measured `stripe` at 0 occurrences). These carry `expected_relevant_count: 0` and
exist to test thresholding and fallback — a good ranker returns nothing rather than a confident
wrong answer.

A zero-result query is only admissible if the absence was **verified across the whole corpus**, not
merely unfound by one search.

---

## 9. Annotation procedure

1. Author the query and its intent **before** seeing any candidate.
2. Pool candidates from several independent sources (§ pooling method in the coverage report).
3. Shuffle, strip source and score, present blinded.
4. Grade each candidate against §2–§5.
5. Record the grade; record `0` explicitly for judged-and-rejected candidates, so the pool is
   auditable and a later method cannot claim credit for a record that was never seen.

---

## 10. Known limitation: one annotator

There is **one** annotator. Inter-annotator agreement therefore **cannot** be computed, and none is
reported. Inventing one would be a fabricated metric.

What is available instead: a **re-annotation subset** graded a second time, separated from the
first pass, giving a self-agreement figure. That is the noise floor below which a retrieval
improvement is not distinguishable. It is a weaker guarantee than multi-annotator agreement and is
labelled as such wherever it is used.
