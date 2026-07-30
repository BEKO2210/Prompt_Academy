# ADR-0005 — Model provider abstraction

**Status:** Proposed
**Date:** 2026-07-30

## Context

The engine must call models. ADR-0001 selects a local runtime using the existing isolated ollama
installation (`~/open-webui`) as the first and only provider.

The master prompt (§22, §23, §24) requires no vendor lock-in, a provider adapter layer, support for
OpenAI-compatible APIs / ollama / OpenRouter / local servers, a model router targeting the "cheapest
capable model", and four execution modes (`economy`, `balanced`, `quality`, `local-only`).

Hardware reality: RTX 3070, 8 GB VRAM, 16 GB RAM. One model resident at a time. ComfyUI already
contends for the same VRAM — a known, previously-experienced conflict.

The benchmark (H2) requires at least one strong-model reference arm, which means at least one hosted
provider will be needed for the harness even though the engine itself runs locally.

## Decision

**Define a minimal provider adapter interface and one model-descriptor shape. Implement exactly one
adapter (ollama / OpenAI-compatible) now. Write the router as a seam, not as a system.**

Model descriptor (§22):

```json
{
  "provider": "", "model": "", "context_window": 0,
  "input_cost": 0, "output_cost": 0,
  "capabilities": [], "local": false
}
```

Adapter interface: complete a request, report token usage, report latency, surface typed errors.
Nothing more — streaming, tool-calling and structured output are added when a component needs them,
not speculatively.

Specific positions:

1. **The "router" is a config lookup until there are multiple tiers with data to route on.**
   With one provider, routing sophistication would be untestable ornament. It becomes a real router
   when telemetry provides per-model skill performance (§33) — which requires this layer to ship
   first. Build the seam; do not build the intelligence yet.
2. **Execution modes are modelled in config now, implemented when a second provider exists.**
   With only ollama configured, `economy`, `balanced` and `local-only` collapse to identical
   behaviour. Declaring four modes that behave identically and calling it done would be placeholder
   functionality, which the master prompt forbids. Config models them; behaviour differentiates when
   there is something to differentiate.
3. **The strong-model reference is scoped to the benchmark harness, not the engine.** This keeps
   credentials out of the engine path (threat T5) while still enabling H2 to be tested.
4. **No design may assume concurrent local models.** One resident model on 8 GB. Any parallel
   execution plan is invalid on this hardware and must be gated on hardware capability, not assumed.
5. **Typed, structured errors** distinguishing retryable from non-retryable (§75, §76). Timeouts,
   bounded retries with backoff, no endless retry.
6. **Token accounting on every call** (§89): input, output, cached input where the provider reports
   it, cost, latency, task, reason. Without this the benchmark cannot compute efficiency metrics.

## Alternatives

**Build the full multi-provider router with all four modes now.**
Rejected. Three of four modes would be indistinguishable, the router would have no data to route on,
and none of it would be testable. This is precisely the "placeholder marked as finished" pattern the
master prompt prohibits, and §88's warning against complexity without demonstrated benefit applies.

**Use a third-party LLM abstraction library.**
Considered, not chosen. Per §79 (no dependency without benefit): the required surface is a single
HTTP call to an OpenAI-compatible endpoint plus usage parsing. A general abstraction layer brings
dependency weight, its own abstractions, and update burden for functionality measured in dozens of
lines. Reconsider if the provider count grows and the adapters start diverging meaningfully.

**Target a hosted provider first for better output quality.**
Rejected: contradicts ADR-0001, introduces recurring cost and a credential before the premise is
tested, and conflicts with the local-first preference.

**Skip the abstraction; call ollama directly.**
Rejected. The abstraction is cheap now and expensive to retrofit once call sites proliferate. It is
also what makes the H2 benchmark (same compiled prompt, different model tiers) straightforward
rather than a special case.

## Consequences

**Positive**
- No vendor lock-in, at a cost of roughly one interface and one adapter.
- Zero credentials in the engine path; nothing to leak (threat T5).
- Adding a provider later is an adapter, not a refactor.
- Token accounting from day one makes the benchmark's efficiency metrics possible at all.

**Negative**
- Local 8 GB-class model quality bounds what the first slice can demonstrate. This is a genuine
  confound for H2 and is called out in `benchmark-plan.md` §4: if `small + engine` underperforms,
  running the identical compiled prompt through a strong model separates "the scaffolding is
  ineffective" from "this model cannot follow it".
- One resident model means benchmark runs across tiers are sequential and slow. Accepted; it is a
  time cost, not a correctness problem.

**Risks**
- VRAM contention with ComfyUI can make runs fail or thrash. Mitigation: treat it as a known
  operational precondition — do not run benchmarks concurrently with ComfyUI, and record hardware
  state in the reproducibility metadata (§48).
- Cost fields will be zero for local models; efficiency metrics must not divide by zero and must
  label local runs as such rather than reporting misleading "infinite success per dollar".
