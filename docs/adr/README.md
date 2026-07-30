# Architecture Decision Records

Each ADR records one significant decision: its context, the decision, alternatives considered, and
consequences. Together with `docs/roadmap.md`, these are the **source of truth** for architecture
and project status.

Format per record: Context · Decision · Alternatives · Consequences · Status.

Status values: `Proposed` · `Accepted` · `Rejected` · `Superseded by ADR-XXXX` · `Deprecated`.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-engine-runtime.md) | Engine runtime environment | **Proposed — gates M3, decision required** |
| [0002](0002-skill-schema-evolution.md) | Additive skill schema evolution | Proposed |
| [0003](0003-retrieval-architecture.md) | Retrieval architecture: BM25-first, no vector DB | Proposed |
| [0004](0004-trust-model.md) | Trust model & instruction precedence | Proposed |
| [0005](0005-model-provider-abstraction.md) | Model provider abstraction | Proposed |
| [0006](0006-validation-architecture.md) | Validation architecture: deterministic first | Proposed |
| [0007](0007-versioning.md) | Skill versioning & provenance | Proposed |

All are `Proposed`. None has been implemented. ADR-0001 is the gating decision for the entire
engine half of the roadmap and should be decided before M3 is planned in detail.
