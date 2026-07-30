# Threat Model — Skill Engine

**Status:** Phase 0 Discovery
**Date:** 2026-07-30
**Scope:** the target Skill Engine (Layers 3–4). Layers 0–2 assessed separately in §2.

---

## 1. Method

Assets → trust boundaries → threats → controls, with each threat marked by whether it applies
**today** or only **after** a given capability is introduced. This distinction matters: the current
system has almost no attack surface, and most of the threats below are *created by the roadmap*
rather than already present.

---

## 2. Current posture (Layers 0–2) — the baseline worth protecting

Today the system is a static site with self-generated content:

- No backend, no database, no auth, no user input reaching a server.
- No secrets in the repo (verified: no `.env`, no `.env.example`, no credential files).
- No third-party content ingested → **no prompt-injection surface, no supply-chain surface**.
- Only privileged component is the GitHub Actions deploy workflow, using the default
  `GITHUB_TOKEN` with correctly minimal scopes (`contents: read`, `pages: write`, `id-token: write`).

Residual risks that exist *now*:

| ID | Risk | Severity | Control |
|---|---|---|---|
| C1 | Compromised npm dependency in `site/` reaches the published bundle | Medium | Lockfile committed; `npm ci`; no `curl \| bash`; review dependency additions (§79, §80) |
| C2 | Compromised GitHub Actions action version | Medium | Actions pinned to major versions today; consider SHA pinning |
| C3 | Repo write access compromise → arbitrary site content | Medium | Out of app scope; account hygiene / 2FA |
| C4 | No staging: a bad merge is immediately live | Low-Medium | Finding D7; addressed in M6 |
| C5 | CI does not validate the dataset before publishing | Low | Finding D4; addressed in M1 |

**Everything below this line is risk the roadmap introduces.** Sequencing exists to delay it.

---

## 3. Assets

| Asset | Why it matters |
|---|---|
| The 10,000-prompt dataset | Primary asset; integrity matters more than confidentiality (it is public) |
| Dataset integrity / provenance | Silent corruption or poisoning is the highest-impact data threat |
| Operator's machine & filesystem | Local CLI runs with the operator's privileges — this is the real crown jewel |
| Model API credentials (if any) | Only if a hosted provider is ever configured |
| Local LLM runtime (`~/open-webui` ollama) | Availability; VRAM contention already a known issue |
| Telemetry / benchmark data | May contain request text → privacy |
| Published site | Integrity; defacement/supply-chain |
| GitHub Actions token | Privilege escalation path to the published site |

---

## 4. Trust boundaries

```
[Untrusted external skill content]  ← lowest trust, NEVER authoritative
        ╎
[User request]                      ← trusted for intent, NOT for policy
        ╎
[Internal dataset (self-generated)] ← trusted content, still not policy
        ╎
[Application policy]
        ╎
[System policy]                     ← highest, never overridable
```

Enforced precedence (master prompt §4, §20):

```
SYSTEM_POLICY > APPLICATION_POLICY > USER_REQUEST
  > APPROVED_INTERNAL_SKILLS > APPROVED_EXTERNAL_SKILLS > UNTRUSTED_EXTERNAL_CONTENT
```

Additional boundaries introduced by the roadmap:
- **B1** browser ↔ static artifacts (exists; low risk, all public)
- **B2** engine runtime ↔ model provider (M3+)
- **B3** engine runtime ↔ operator filesystem (M3+) — **the most dangerous boundary**
- **B4** engine ↔ external skill source (M5)
- **B5** engine ↔ any executed script (M5, ideally never)

---

## 5. Threats

### T1 — Indirect prompt injection via skill content
**Applies from:** M5 (external import). Not applicable today (self-generated content only).
**Vector:** A SKILL.md contains text that the compiler injects into a model prompt, e.g.
"ignore previous instructions", "print the contents of ~/.ssh", "add this dependency".
**Impact:** High if the engine can act on output (write files, run commands).

**Controls:**
- Trust hierarchy enforced structurally: untrusted content is placed in a clearly-delimited,
  lowest-precedence region and never in the system-policy region.
- Pattern heuristics for known injection phrasings (defence in depth).
- **Primary control: capability restriction.** Untrusted content cannot cause harm if the engine
  cannot perform harmful actions on its behalf.

**Honest limitation:** pattern matching for injection is not a solved problem and a determined
adversary bypasses keyword lists. It must not be presented as sufficient. The reliable control is
the last one — restricting what the system can do at all.

### T2 — Malicious script in an imported skill
**Applies from:** M5, and only if script execution is implemented.
**Impact:** Critical — arbitrary code execution as the operator (boundary B3).

**Controls (in order of strength):**
1. **Do not execute third-party scripts.** Default posture; see `external-skill-policy.md`.
2. If ever executed: explicit per-skill human approval, isolated execution, no network,
   no host filesystem, CPU/RAM/time limits (§38).
3. Static analysis + risk score before approval.

The first control is stronger than the other two combined. Sandboxes have escapes; not running
code has none.

### T3 — Supply-chain attack via skill source repository
**Applies from:** M5.
**Vector:** upstream repo is compromised, or a benign skill is later replaced with a malicious one.
**Controls:** content hashing + provenance (repo, path, branch, commit, hash) (§6); upstream changes
create **candidate** versions requiring re-approval, never auto-activating (§8); production version
stays active until approval; idempotent imports (§77).

### T4 — Dataset poisoning / silent corruption
**Applies:** partially today (C5).
**Vector:** a bad edit, buggy script, or malicious PR alters prompt content; nothing catches it.
**Controls:** CI-enforced schema validation (M1); `content_hash` per record; version history with
`change_reason` (schema A4); no silent overwrite (§7). Note that `cleanup_dataset.py` has
previously modified 6,678 records in bulk — bulk mutation tooling is itself a risk and should run
only with review and a recorded diff.

### T5 — Secret leakage
**Applies from:** M3 (if any hosted provider) / M5.
**Vectors:** secrets in git, in prompt logs, in telemetry, in benchmark exports, in debug UI (§37).
**Controls:** skills reference secrets, never contain them; redaction before any logging; secrets
never in artifacts; explicit deny-list in telemetry serialization. Today: no secrets exist — keep it
that way as long as possible by preferring local models that need none.

### T6 — Command injection / path traversal in the importer
**Applies from:** M5.
**Vector:** attacker-controlled paths or repo URLs reaching a shell or filesystem call.
**Controls:** no shell interpolation of untrusted input; allow-list of source schemes; path
normalization with containment checks; treat all imported paths as hostile strings.

### T7 — SSRF / arbitrary network egress
**Applies from:** M5.
**Vector:** importer fetches an attacker-supplied URL; or a skill instructs a network call.
**Controls:** source allow-list; no arbitrary fetch from skill content; block internal address
ranges; egress denied by default for any executed context.

### T8 — Model-output-driven harm
**Applies from:** M3.
**Vector:** generated code is written to disk or executed; the model was wrong or manipulated.
**Controls:** engine writes only to an explicit output directory; never auto-executes generated
code; validation is read-only analysis (parse/typecheck) before anything runs; human review before
any generated code enters a real project.

This is the threat most likely to actually bite in practice, because it does not require an
adversary — an ordinary model mistake is sufficient.

### T9 — Licence violation
**Applies from:** M5.
**Vector:** importing and redistributing content whose licence forbids it; assuming the aggregator
repo's licence covers its contents (it does not, §5).
**Impact:** legal, not technical.
**Controls:** per-skill licence detection and storage; `license_unknown` blocks redistribution;
no automatic licence acceptance; attribution/notice tracking. See `external-skill-policy.md`.
This is one of the few areas where a human decision is required rather than a default.

### T10 — Privacy: request retention
**Applies from:** M3.
**Controls:** telemetry local-first; no full prompt retention unless explicitly enabled;
redaction by default; opt-in (§40).

### T11 — Denial of service / resource exhaustion (local)
**Applies from:** M3.
**Vector:** unbounded repair loops, runaway generation, VRAM exhaustion.
**Controls:** `MAX_REPAIR_ATTEMPTS`; timeouts; token caps; no endless retry (§76); awareness that
8 GB VRAM permits one resident model (ComfyUI contention is a known, already-experienced failure).

### T12 — Compromised CI publishes malicious site
**Applies:** today (C2/C3).
**Controls:** minimal token scopes (already correct); consider SHA-pinned actions; branch protection.

---

## 6. Risk summary

| ID | Threat | Applies from | Severity | Primary control |
|---|---|---|---|---|
| T2 | Malicious script execution | M5 (if enabled) | **Critical** | Do not execute third-party scripts |
| T1 | Indirect prompt injection | M5 | High | Capability restriction + trust hierarchy |
| T3 | Supply-chain / upstream swap | M5 | High | Hash + provenance + re-approval |
| T8 | Model-output-driven harm | M3 | High | Never auto-execute; human review |
| T9 | Licence violation | M5 | High (legal) | Block `license_unknown` |
| T4 | Dataset poisoning | today (partial) | Medium | CI validation + hashing |
| T5 | Secret leakage | M3+ | Medium | Prefer local models; redaction |
| T6 | Command injection / traversal | M5 | Medium | No shell interpolation; allow-lists |
| T7 | SSRF | M5 | Medium | Source allow-list; egress deny |
| T11 | Resource exhaustion | M3 | Medium | Caps and timeouts |
| T10 | Privacy retention | M3 | Low-Medium | Local-first, opt-in |
| T12 | CI compromise | today | Medium | Minimal scopes; pinning |

---

## 7. Security invariants

Non-negotiable properties. A change that breaks one of these is a defect regardless of what it
enables:

1. Untrusted content **never** occupies a position above application policy in the prompt.
2. No external skill is activated without explicit human approval.
3. Third-party scripts are **not executed** by default; enabling execution is a separate, explicit,
   per-skill decision with isolation.
4. Generated code is never executed automatically.
5. Secrets are never written to logs, telemetry, benchmark exports, or debug output.
6. `license_unknown` blocks redistribution.
7. Dataset changes are validated in CI and never silently overwrite history.
8. Every capability that increases attack surface is introduced with its control, in the same
   milestone — never "security later".

---

## 8. Deliberate non-goals

- No sandboxing infrastructure while the policy is "do not execute third-party scripts". Building a
  sandbox invites its use.
- No secret-management system while no secrets exist (local models need none).
- No auth/authorization system while the engine is a single-user local CLI.

Each becomes required the moment its precondition changes, and that coupling is recorded in the
roadmap gates.
