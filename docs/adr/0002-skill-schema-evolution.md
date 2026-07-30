# ADR-0002 — Additive skill schema evolution

**Status:** Proposed
**Date:** 2026-07-30

## Context

The existing dataset has 10,000 records conforming exactly to `schema/prompt.schema.json`
(21 required fields, JSON Schema draft-07). Measured: the field union across all records matches
the schema with no drift, no extra keys, no missing keys.

The dataset is already richer than a flat prompt list. It has `acceptance_criteria` (3–6 per record,
present on all 10,000), a non-empty `negative_prompt` on all 10,000, structured `style` and
`tech_stack`, and per-record `quality` scores. Several fields in the master prompt's proposed Skill
Schema are therefore already partially satisfied.

The master prompt proposes a much larger schema including `type`, `capabilities`, `dependencies`,
`incompatible_with`, `required_tools`, `required_permissions`, `required_secrets`, `resources`,
`scripts`, `source`, `license`, `security`, `runtime`, `retrieval`, `metrics`.

Constraints: existing data must not be lost; migrations must be backward compatible; the site must
keep building; and the dataset should remain human-authored and diffable.

## Decision

**Evolve the schema additively, in the milestone where each field has data to hold.**
No field removals, no renames, no type changes. Every addition is optional with a default so all
10,000 existing records stay valid.

**Adopt now (M1):**

- `capabilities[]` — controlled, versioned vocabulary in `schema/capabilities.vocabulary.json`.
  This is the critical addition: without it there is no capability-based routing at all
  (finding D2). Populated **deterministically** where possible — a hand-reviewed
  subcategory→capabilities mapping table (200 rows) rather than 10,000 model calls.
- `content_hash` — cheap, and enables idempotent import and change detection later.

**Adopt when the importer exists (M5):**

- `source{}` provenance (repository, path, branch, commit, content_hash, imported_at,
  upstream_author, upstream_url)
- `license{}` (SPDX, detected licence, redistribution/commercial/modification flags, attribution)
- `security{}`, `required_permissions[]`, `required_tools[]`, `required_secrets[]`, `scripts[]`,
  `resources[]`, `type` discriminator

**Adopt when records begin to change (M4/M5):**

- Version history: `parent_version`, `change_reason`, `status`
  (`draft|quarantine|approved|deprecated|blocked|archived`)

**Not in `data/*.jsonl` at all:**

- Retrieval support structures (term vectors, document lengths, duplicate clusters, embeddings) live
  in **build artifacts**, not the source dataset. They are derived, large, and regenerable.

## Alternatives

**Adopt the full proposed schema immediately.**
Rejected. It would add ~15 fields that no producer populates and every consumer must handle. Empty
`security{}` and `license{}` blocks on 10,000 self-generated records are ceremony, not information,
and they obscure which fields are real. Schema bloat also makes the eventual real design harder,
because the placeholder shape gets baked into consumers.

**Rewrite the schema cleanly for the new model.**
Rejected: violates extension-over-replacement, breaks the site, and risks the primary asset for no
measured benefit.

**Introduce a separate `skills/` dataset alongside `data/`.**
Rejected for now — two parallel structures with unclear ownership (the master prompt explicitly warns
against inventing a second structure). Reconsider only if external skills prove structurally
incompatible with prompt records, which is plausible; if so, that is a new ADR.

**Derive `capabilities[]` with a model over all 10,000 records.**
Rejected as the primary method. Determinism-first (§87): 200 reviewed mapping rows are auditable,
diffable, free, and reproducible. Model labelling is acceptable only for the residual and only with
a measured agreement rate against a human-labelled sample — unverified labels silently corrupt
ranking, which is worse than having no labels.

## Consequences

**Positive**
- Existing 10,000 records remain valid; nothing breaks; the site keeps building.
- Each field arrives with data to populate it, so the schema stays honest.
- The capability vocabulary unblocks the resolver and capability-based ranking.
- Source dataset stays human-readable and diffable; derived bulk data stays in build artifacts.

**Negative**
- The vocabulary design is the least reversible part: later changes imply relabelling 10,000
  records. Mitigated by versioning the vocabulary from day one and keeping the mapping table as the
  single point of change.
- Multiple small migrations over time rather than one big one. Acceptable, and safer.

**Risks**
- A poorly-designed capability vocabulary produces plausible-looking but useless routing. Mitigation:
  measure capability-match contribution as its own ablation arm (R3 in `benchmark-plan.md`); if it
  does not improve precision, the vocabulary is wrong and must be revised rather than weighted up.
- Bulk mutation tooling is itself a hazard: `cleanup_dataset.py` has previously modified 6,678
  records in one pass. Any migration must run with review and a recorded diff.
