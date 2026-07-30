# ADR-0006 — Validation architecture: deterministic first

**Status:** Proposed
**Date:** 2026-07-30

## Context

Model output is not automatically correct (§25). Validation is what converts "the model produced
something" into "the task succeeded" — and it is therefore the foundation of every measurement in
`benchmark-plan.md`. Without trustworthy validation there is no benchmark, and without a benchmark
none of the project's claims are testable.

A relevant asset already exists: **all 10,000 dataset records carry 3–6 `acceptance_criteria`, and
all 10,000 carry a non-empty `negative_prompt`** (measured). The same record that guided generation
therefore also supplies checks and prohibitions. This is the strongest structural argument in the
project's favour and should be exploited early.

The domain is UI/frontend code generation (React/Vue/Svelte/Next/Angular per measured `tech_stack`),
which is unusually amenable to cheap static checking.

## Decision

**Validate deterministically first, in a strict cost order. An LLM judge is a last resort, and if
used, its agreement with human judgement must be measured before its verdicts are trusted.**

Validation tiers, cheapest first:

| Tier | Checks | Cost |
|---|---|---|
| 0 | Output non-empty; expected format; valid JSON where JSON is expected | trivial |
| 1 | Code parses (TS/JSX parser only, no typecheck) | cheap |
| 2 | Imports resolve; forbidden packages absent (derived from `negative_prompt`); required exports/elements present | cheap |
| 3 | `tsc` typechecks | moderate |
| 4 | Acceptance-criteria keyword presence (weak signal, explicitly labelled as weak) | cheap |
| 5 | Build succeeds | expensive |
| 6 | Generated tests pass | expensive |
| 7 | Human blind comparison on a subsample | expensive, high quality |
| 8 | LLM judge | last resort, must be validated itself |

Rules:

1. **Fail fast.** A tier-1 parse failure short-circuits; do not spend a typecheck on unparseable output.
2. **`negative_prompt` becomes machine-checkable where possible.** Forbidden packages, forbidden
   patterns. This turns existing prose into deterministic assertions at essentially no cost.
3. **`acceptance_criteria` are preserved through compilation** (ADR-0004 non-trimmable region) and
   fed to the validator. The bridge from retrieval to validation runs through these fields.
4. **Keyword-presence checking is labelled as a weak proxy**, not as acceptance-criteria
   satisfaction. A criterion "must be keyboard navigable" is not verified by the string "keyboard"
   appearing in output. Reporting it as verified would be a fabricated metric.
5. **Validation is read-only static analysis. Generated code is never executed to validate it**
   (threat T8). Build/test tiers, if enabled, run only in an explicitly isolated workspace on
   deliberately generated code, never as an implicit step.
6. **Every failure is classified** by the taxonomy (§28) from day one, even before the repair engine
   exists — the taxonomy is how we learn *where* the pipeline actually breaks.
7. **The repair engine is gated on validation reliability.** Repair driven by an unreliable signal
   amplifies noise. Sequence: validation → measure its signal quality → then repair.

## Alternatives

**LLM-as-judge as the primary validator.**
Rejected as primary. It is the easiest thing to build and the easiest way to fool oneself: an
unvalidated judge produces confident, plausible, unfalsifiable scores. Reporting them as task success
would be exactly the fabricated-benchmark failure the master prompt forbids. Permitted only at tier 8,
only where deterministic checks genuinely cannot decide, and only with a measured agreement rate
reported alongside every result it produces.

**Human evaluation only.**
Rejected as primary: does not scale to 50–100 tasks × 5 arms × 2+ model tiers. Retained at tier 7 for
subsamples, where its quality is highest and its cost is bounded.

**Run the generated app and check it renders.**
Rejected for the first slice. High setup cost, slow, and it means executing generated code — the
threat most likely to cause real harm without any adversary involved (T8). Static checks give most of
the signal for a fraction of the cost and risk.

**Trust the dataset's `quality.*_score` fields as an outcome measure.**
Rejected. Those are self-reported by the generating agents and independently unvalidated
(finding D6). They describe the *prompt*, not the *output*, and using them as outcome evidence would
be circular.

## Consequences

**Positive**
- Fast, cheap, reproducible pass/fail signal — deterministic checks give the same answer every run,
  which is what makes benchmark comparisons meaningful.
- Exploits `acceptance_criteria` and `negative_prompt`, which already exist on all 10,000 records.
- No credentials, no model calls, no cost for tiers 0–5.
- Failure taxonomy produces actionable direction rather than a single opaque score.

**Negative**
- Deterministic checks verify *structure*, not *quality*. Code can typecheck perfectly and still be a
  poor interface. This ceiling must be stated whenever results are reported; "task success" under
  this definition means "passed the structural checks", not "is good".
- Tier-4 keyword checking is genuinely weak and could flatter results if misread as semantic
  verification. Mitigation: report it as a separate, explicitly-weak metric — never folded into the
  headline success rate.
- Accessibility criteria (common in this dataset) are among the hardest to check statically. Some
  are checkable (ARIA attributes present, focus styles defined); many are not. Do not claim coverage
  that does not exist.

**Testing requirement**
The validators themselves need tests with known-good and known-bad fixtures. A validator that always
passes is worse than no validator, because it manufactures success.
