# ENG-018 — The bottleneck is retrieval, not prompt composition

**Date:** 2026-07-31 · 0 model calls for this measurement.

## What was measured

For each of the 20 DEV_CLEAN tasks: the top-1 retrieved record, read against the task request.

| verdict | n | share |
|---|---|---|
| RELEVANT — same component and purpose | **2** | 10% |
| PARTIAL — related, different component or scope | 7 | 35% |
| **IRRELEVANT — topically unrelated** | **9** | **45%** |
| NOTHING retrieved | 2 | 10% |

**55% of tasks receive an actively wrong record or none at all. 10% receive a genuinely right one.**

## The cause, verified rather than assumed

Query formulation backs off until a conjunction can be satisfied, and lands on a single
mid-frequency token. That token is frequently a generic word:

| task | formulated query | retrieved |
|---|---|---|
| responsive sidebar | `desktop` | Transform Crm Dashboards |
| image upload with crop | `before` | Food Shop with Best Before Display |
| quiz screen | `end` | High-End Brand Landing Page |
| leaderboard | `name` | Domain Name Search |
| unit tests for a cart | `tests` | AP Exam Practice Tests |
| course progress | `pro` | Social-First Product Launch |

**The corpus is not the problem.** Hand-writing the query a person would actually type finds the
right record for 7 of the 9 irrelevant cases:

| hand query | retrieved |
|---|---|
| `sidebar` | **Collapsible Admin Sidebar** |
| `image upload crop` | **Image Crop Upload Form** |
| `quiz question` | **Peer-Created Question Quiz** |
| `leaderboard score` | **Leaderboard Interfaces Design** |
| `course progress` | **Course Module Progress Ring** |
| `hero section` | **Glassmorphism Hero with Floating Cards** |

The records exist. Retrieval fails to reach them.

## Why this reframes the whole project

Arms B, C, D and E inject a record that is wrong or absent for 55% of tasks. Whatever those arms
measure, it is **not** "does a relevant skill help" — it is "does injecting a mostly-irrelevant
record help", and the answer to that was never in doubt.

This explains, without any further experiment:

- **B (0.645) scoring below A (0.774)** in the pilot. Injecting an unrelated record is worse than
  injecting nothing.
- **the four refusals**, where the model said so outright: *"the reference context specifies a
  matching pairs quiz, while the request asks for a memory card game"*. The model detected the
  retrieval error we had not measured.

It also matches the published evidence: retrieved similar code "often introduces noise, degrading
results by up to 15%", and with noisy retrieval "realistic noise can easily depress RAG performance
below that of the base LLM".

## What follows

**Do not build a prompt compiler.** It would compile the wrong records more elegantly.

**The measured gap is in one component**: turning a task request into a retrieval query. That is
also the cheapest thing in the stack to improve, and it can be measured without a single model call
— this whole report cost zero inference.

The A–E comparison should be re-run only after retrieval reaches a usable hit rate. Running it now
answers a question nobody asked.

## Honest limits

- 20 tasks, one reviewer, top-1 only. The relevance judgement is mine and was not blinded — but the
  judgement is about a *record versus a request*, with no arm involved, so arm bias cannot enter.
- "PARTIAL" is a soft category. Even counting every PARTIAL as a success, the usable rate is 45%.
- No ground truth for task→skill relevance exists yet. This is a reading, not a benchmark. It is
  strong enough to redirect work and not strong enough to be a published number.
