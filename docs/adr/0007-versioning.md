# ADR-0007 — Skill versioning & provenance

**Status:** Proposed
**Date:** 2026-07-30

## Context

Every dataset record currently carries `version: "1.0.0"` — a static string with **no history
mechanism**. A record is edited in place; the previous state exists only in git history, and git
history at the file level cannot answer "what changed about PRM-001234 and why".

This is acceptable today: the dataset is self-generated, published as a unit, and nothing consumes
per-record version identity. It stops being acceptable the moment any of the following is true:

- records are improved automatically or semi-automatically (§95, §96)
- external skills are imported and can be updated upstream (§8)
- benchmark results must remain interpretable (a result is meaningless if the record it tested has
  since changed silently)
- ranking depends on measured historical performance per record

The last two matter most. Master prompt §7 requires that skills are never silently overwritten, and
§48 requires that benchmark results record `skill_versions` — which presupposes versions exist.

A relevant hazard: `cleanup_dataset.py` has previously modified **6,678 records in a single bulk pass**
(per `reports/generation_report.md`). Bulk mutation tooling exists and has been used at scale, with no
per-record change record.

## Decision

**Introduce versioning in two stages: `content_hash` now (cheap, enables everything else), full
version history when records actually begin to change.**

**Stage 1 — now (M1):**

- `content_hash`: sha256 over the normalized content-bearing fields of each record.
- Purpose: change detection, idempotency (§77), cache keying (§41), and benchmark traceability.
- Cost: one build-time computation. No workflow change.

**Stage 2 — when records begin changing (M4/M5):**

```
skill_id, version, parent_version, source_commit, content_hash,
created_at, change_reason, status
```

Status vocabulary (§7): `draft | quarantine | approved | deprecated | blocked | archived`.

Rules for stage 2:

1. **No silent overwrite.** A change produces a new version with `parent_version` and a
   `change_reason`. The previously approved version remains identifiable.
2. **Upstream changes create candidates, never activations** (§8). A candidate must pass security
   scan → licence scan → tests → benchmark → diff review → approval before it can become active. The
   production version stays live throughout.
3. **`skill diff` surfaces what actually matters** (§85): instructions, scripts, permissions,
   dependencies, licence, risk. A change to permissions or scripts between versions is a high-signal
   review trigger, not a routine diff.
4. **Deletion is status change, not removal.** `deprecated`/`archived`/`blocked` rather than hard
   delete, so provenance and past benchmark results stay interpretable.
5. **Cache keys include the version** (§41). A stale cached skill silently serving old content would
   corrupt both behaviour and measurements.
6. **Rollback to a previous approved version must be possible** (§99).
7. **A/B before replacing.** Per §95, an "improved" record is a candidate measured against the
   incumbent; only a measured improvement is promoted. Prompts are not "improved" on aesthetic
   judgement.

**Provenance** (`source{}` per §6) arrives with the importer (M5), since self-generated records have
no upstream to record. Fields: repository, path, branch, commit, content_hash, imported_at,
upstream_author, upstream_url.

## Alternatives

**Rely on git history alone.**
Rejected for stage 2, accepted implicitly for stage 1. Git tracks *files*, not records. With 1,000
records per file, answering "what changed about this record and why" requires archaeology, and
`change_reason` has nowhere to live. Git also cannot express "this version is approved, that one is
a candidate".

**Implement full version history now.**
Rejected. Nothing currently changes records, so the machinery would carry no data — the same
empty-ceremony objection as in ADR-0002. `content_hash` is the part that is cheap now and expensive
to retrofit, so only that is adopted early.

**Store version history in a database.**
Rejected: requires the backend that ADR-0001 declines to build. JSONL plus derived indexes is
sufficient at this scale and keeps the dataset diffable and human-readable.

**Immutable append-only records with no in-place edits at all.**
Considered; attractive for auditability. Rejected for now as heavier than the current authoring
workflow warrants, and it would multiply the shipped dataset size — a real concern given the measured
6.9 MB index (finding D1). Reconsider if automated improvement (§96) ever becomes real, since that is
the scenario where in-place editing becomes genuinely dangerous.

## Consequences

**Positive**
- `content_hash` immediately enables idempotent import, correct cache keys, and benchmark
  traceability — for one build-time computation.
- Benchmark results stay interpretable over time, which is a precondition for the whole measurement
  strategy.
- Upstream updates cannot silently change production behaviour.
- Bulk mutation tooling becomes auditable: a mass change produces a mass of recorded version
  transitions rather than an invisible rewrite.

**Negative**
- Version metadata grows the dataset. Given finding D1, version history should live in build
  artifacts or a sidecar file rather than being shipped in the browser index.
- Approval workflow adds friction to updating records. That friction is the point for external
  content; for internal records it should stay lightweight or it will be bypassed.

**Risks**
- A half-implemented version system is worse than none: if some records carry history and others do
  not, consumers must handle both and will get it wrong. Mitigation: stage 2 migrates all records at
  once, with a recorded diff and review (see the 6,678-record precedent).
- Version identity is only useful if consistently referenced. Telemetry and benchmark records must
  capture `skill_versions[]` from the first run, or early results become uninterpretable
  retroactively.
