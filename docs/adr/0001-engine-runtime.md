# ADR-0001 — Engine runtime environment

**Status:** **Accepted** (2026-07-30), with the layering constraint in §Decision as binding
**Date:** 2026-07-30

## Context

Prompt Academy is today a fully static site on GitHub Pages: no backend, no database, no API, no
server-side runtime, and no LLM invocation at build or run time (see `architecture/current-state.md`).

The target Skill Engine requires, at minimum, the ability to call a model and to run deterministic
validators over generated code. A static site cannot do either. Master prompt components 9–34
(normalizer, router, decomposer, compiler, execution, validation, repair) all presuppose a runtime.

This is not an incremental feature. Introducing a runtime changes the project's category, with
consequences for hosting, recurring cost, security surface, and maintenance burden. It should
therefore be decided explicitly and once.

Two facts constrain the decision:

1. **The engine's core premise is untested.** H1 (retrieval improves output) and H2 (small model +
   engine ≈ strong model) have no supporting evidence in this repository. Committing infrastructure
   before testing them risks paying for a wrong assumption.
2. **A suitable local runtime already exists and is isolated.** ollama + Open-WebUI via compose in
   `~/open-webui`, on an RTX 3070 (8 GB VRAM). Hardware limit: one resident model at a time; ComfyUI
   already contends for that VRAM.

The operator's standing preference is for isolated installs that do not bloat the system.

## Decision

**Adopt Option A: a local experiment runtime on the operator's machine, using the existing ollama
endpoint as its first provider.** No hosted service, no public endpoint, no new infrastructure.

**Ollama is the first provider. Ollama is not the architecture.** This distinction is the binding
part of this decision, and it is enforced by a three-layer structure:

```
┌───────────────────────────────────────────────────────────────┐
│ LAYER 3 — Thin CLI                                             │
│   Local experiment / benchmark surface. Argument parsing,       │
│   run invocation, result printing. No logic worth testing.      │
└───────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────┐
│ LAYER 2 — Provider adapters                                    │
│   Ollama adapter (first). Implements the provider interface     │
│   defined by the core. Knows nothing about retrieval, ranking,  │
│   arms, datasets, metrics or benchmarks.                        │
└───────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────┐
│ LAYER 1 — Core engine library  ── PROVIDER-NEUTRAL              │
│   dataset access · retrieval · ranking · field split (C/D)      │
│   prompt-arm construction · compilation · context budget        │
│   validation · metrics · telemetry · benchmark logic            │
│   Depends only on the provider *interface*, never on a provider.│
└───────────────────────────────────────────────────────────────┘
```

**Placement rule (binding):** retrieval, ranking, prompt-arm generation, dataset access, the
deterministic descriptive/actionable field split, validation, metrics and benchmark logic live in the
**core library**. None of it may live in provider-specific or CLI-specific code.

Test for compliance: the core library must be usable, and its tests must pass, with a stub provider
and no ollama installed. If removing the ollama adapter breaks retrieval, ranking or the benchmark,
the layering has been violated.

Two further structural requirements:

1. The engine is a **library** first; the CLI is a thin entry point, not the program. Later promotion
   to a service is then a deployment change rather than a rewrite.
2. The **ranking module is shared** with the static site (one implementation, two consumers), so
   engine behaviour cannot silently diverge from what Library users see.

### When a backend becomes justified

Not on H1 succeeding — on a **real requirement** appearing. Concretely, any of:

- multi-user access
- browser or public API consumption
- remote execution
- a job queue (runs that outlive a request)
- isolation requirements (running untrusted content or third-party scripts)
- distributed workers

Absent one of these, a backend adds cost, surface and maintenance for no capability the local path
lacks. Revisit this ADR when one of the above is actually present, not in anticipation of it.

## Alternatives

**Option B — self-hosted service on the existing home server.**
Real API; reuses known infrastructure. But: ongoing maintenance; a new network surface; and VRAM
contention with ComfyUI is a known, already-experienced failure mode. Premature while the premise
is unproven.

**Option C — managed cloud backend.**
Scales; enables a public feature. But: recurring cost, vendor dependency, the largest security
surface of the four, and it contradicts the local-first preference. Committing to it before H1 is
tested would be the most expensive possible way to discover the premise is false.

**Option D — browser-only with bring-your-own API key.**
Requires no backend at all, which is attractive. Rejected because: handling user API keys in a
browser is a genuine security problem; no server-side validation is possible; and — decisively —
the engine cannot run deterministic validators (parse, typecheck, imports) in a way that is
meaningful for generated project code. Validation is the main source of trustworthy signal, so
removing it removes the point.

**Option E — do nothing; stay a static library.**
Worth naming as a legitimate outcome. If M3 falsifies H1, this becomes the correct end state, and
the improved retrieval from M2 is a good product on its own. Not chosen *now* because the premise is
worth testing cheaply.

## Consequences

**Positive**
- Near-zero cost and near-zero added attack surface: no public endpoint, no secrets, no hosting.
- Fastest path to answering H1/H2, which every downstream decision depends on.
- Matches the isolated-install preference; uses infrastructure that already exists and works.
- Commits the project to nothing that is expensive to undo.

**Negative**
- Single-user. The engine is not a user-facing feature of the published site under this decision.
- Local hardware bounds what can be tested: one 8 GB-class model resident at a time, no parallel
  multi-model execution. Any design assuming concurrency is invalid on this machine.
- A strong-model reference arm for H2 requires an external API and therefore a credential —
  the one place this decision does not avoid secrets entirely. Scope that to the benchmark harness,
  not the engine.

**Security**
- The engine runs with the operator's privileges. Boundary B3 (runtime ↔ filesystem) is the most
  dangerous in the threat model. Mitigations are mandatory, not optional: write only to an explicit
  output directory; never auto-execute generated code; validation is read-only static analysis.
- Prefer local models specifically because they need no credentials (threat T5).

**Reversibility**
High, given the library-not-service and provider-neutrality requirements. Promoting to Option B or C
later is a deployment and hardening exercise, not a rewrite; adding a second provider is an adapter.

**The failure mode this layering prevents**
The realistic risk is not choosing ollama — it is ollama's shape leaking upward: prompt assembly
written against its request format, ranking coupled to its tokenizer, benchmark logic entangled with
its response envelope. Such coupling is invisible while there is one provider and expensive once
there are two. It would also turn the H2 benchmark (identical compiled prompt across model tiers)
into a special case rather than a parameter change. The stub-provider test in §Decision exists to
catch this early and cheaply.
