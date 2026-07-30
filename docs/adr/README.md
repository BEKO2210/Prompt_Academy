# Architecture Decision Records

Each ADR records one significant decision: its context, the decision, alternatives considered, and
consequences. Together with `docs/roadmap.md`, these are the **source of truth** for architecture
and project status.

Format per record: Context · Decision · Alternatives · Consequences · Status.

Status values: `Proposed` · `Accepted` · `Rejected` · `Superseded by ADR-XXXX` · `Deprecated`.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-engine-runtime.md) | Engine runtime environment | **Accepted** — local, provider-neutral core + Ollama adapter + thin CLI |
| [0002](0002-skill-schema-evolution.md) | Additive skill schema evolution | Proposed |
| [0003](0003-retrieval-architecture.md) | Retrieval architecture: BM25-first, no vector DB | Proposed |
| [0004](0004-trust-model.md) | Trust model & instruction precedence | Proposed |
| [0005](0005-model-provider-abstraction.md) | Model provider abstraction | Proposed |
| [0006](0006-validation-architecture.md) | Validation architecture: deterministic first | Proposed |
| [0007](0007-versioning.md) | Skill versioning & provenance | Proposed |

ADR-0001 is **Accepted**; the remainder are `Proposed`. **Nothing has been implemented yet.**

ADR-0001's binding constraint: the core engine library is **provider-neutral**. Retrieval, ranking,
prompt-arm generation, dataset access, metrics and benchmark logic live in the core — never in
provider-specific or CLI-specific code. Ollama is the first adapter, not the architecture. A backend
is introduced only when a real requirement demands it (multi-user, browser/API, remote execution, job
queue, isolation, distributed workers) — not on hypothesis success.
