# External Skill Policy

**Status:** Phase 0 Discovery — policy proposed, no importer exists
**Date:** 2026-07-30
**Applies from:** M5. Nothing external is ingested today.

Companion to `skill-threat-model.md`. This is the rulebook the importer must implement.

---

## 1. Default posture

> **External content is data, never authority. External code is not executed.**

Two sentences that eliminate most of the risk surface. Everything below elaborates them.

---

## 2. Trust classification

Every skill carries a trust level. It determines what the skill may influence.

| Level | Meaning | May influence prompt? | May declare tools? | May execute? |
|---|---|---|---|---|
| `system` | Application's own policy | yes (highest) | n/a | n/a |
| `internal_approved` | Own dataset, reviewed | yes | yes, with approval | no |
| `external_approved` | Imported, security+licence reviewed, human-approved | yes, lowest precedence | only with explicit per-skill grant | **no** by default |
| `quarantine` | Imported, not yet approved | **no** | no | no |
| `blocked` | Rejected | no | no | no |

A skill in `quarantine` is inert: it can be inspected, diffed, and scanned, but it can never reach
a model prompt. This is the property that makes importing safe to do at all.

---

## 3. Import pipeline (mandatory order)

Per master prompt §3. No step may be skipped, and failure at any step leaves the skill in
`quarantine` or `blocked` — never `approved`.

```
1. Fetch                    (allow-listed source schemes only)
2. Source verification      (repo/URL matches allow-list; record resolved commit)
3. Content hash             (sha256 of normalized content)
4. Manifest / SKILL.md parse (structural, see §5)
5. Licence detection        (see §6)
6. Static analysis          (see §7)
7. Prompt-injection analysis (heuristics; defence in depth only)
8. Script analysis          (presence, intent, dangerous patterns)
9. Tool/permission analysis  (what it asks for)
10. Secret requirement analysis
11. Network requirement analysis
12. Risk score              (explainable, per-factor)
13. Human / policy approval  (mandatory for activation)
14. Registry activation
```

**Rule:** import is idempotent (§77). Same `{source, commit, content_hash}` does not re-import.

**Rule:** an *import report* is produced before any production import of a new source (§92):
total references, reachable sources, valid SKILL.md, missing/allowed/unknown licences,
security-flagged, duplicates, importable candidates. Review the report, then decide.

---

## 4. Source adapters

Allow-listed source types only:

| Type | Notes |
|---|---|
| Local directory | Lowest risk; still quarantined |
| Git repository | Record remote, branch, resolved commit |
| GitHub repository | Same; API used read-only |
| Single SKILL.md | Record origin URL |
| Registry manifest | Manifest itself is untrusted content |

**No hardcoding to any specific aggregator.** `VoltAgent/awesome-agent-skills` is *a source*, not
the architecture (§91). The adapter interface comes first; that repo is then one implementation's
input like any other.

**Rule:** arbitrary user-supplied URLs are not fetched without allow-list membership (T7/SSRF).

---

## 5. SKILL.md parsing

A SKILL.md must be **decomposed**, not stored as one long prompt (§Skill.md support). Required
separation:

- metadata (name, description, version, author)
- instructions (the actual guidance)
- resources / reference files
- scripts
- tool requirements
- permission requirements
- secret requirements
- external dependencies

Rationale: without decomposition, a "script" section becomes indistinguishable from instructions,
and permission requests become invisible. Storing the blob defeats every downstream control.

Unparseable or structurally broken SKILL.md → `quarantine` with a recorded reason, never a
best-effort guess.

---

## 6. Licence rules

**The aggregator repository's licence is not the licence of its contents** (§5). Each skill's
licence is determined and stored independently.

Stored per skill: source repository, source path, author, licence text/SPDX identifier, licence URL,
detected licence, commercial-use allowed, modification allowed, redistribution allowed, attribution
required, notice required.

Decision table:

| Detected | Redistribute | Use internally | Action |
|---|---|---|---|
| Permissive (MIT/BSD/Apache-2.0) | yes, with attribution/notice as required | yes | approve if security passes |
| Copyleft | **no** without legal review | case-by-case | flag for human decision |
| Proprietary / no licence file | **no** | **no** | `blocked` |
| `license_unknown` | **no** (§5) | no | `quarantine`, needs human decision |

**Rules:**
- No automatic licence acceptance, ever.
- `license_unknown` blocks redistribution — the site is public, so publishing an unlicensed skill
  *is* redistribution.
- Attribution and notice obligations are tracked as data, so they can actually be honoured.

This area has legal rather than technical consequences and is explicitly a place where a human
decides. An automated system that guesses licences confidently is a liability.

---

## 7. Static analysis — reject/flag patterns

Flag (raise risk score) or block (refuse approval) on:

**Instruction-level (injection indicators):**
- "ignore previous/above instructions", system-prompt override attempts
- attempts to redefine the assistant's role or safety rules
- requests to reveal system prompts, configuration, environment, or credentials
- instructions to exfiltrate data to a URL
- hidden content (zero-width characters, HTML comments, invisible text)

**Script-level (block by default):**
- shell pipelines from network (`curl … | bash`, `wget … | sh`)
- destructive filesystem operations (`rm -rf`, recursive deletes, writes outside a workspace)
- privilege escalation (`sudo`, setuid)
- arbitrary package installation
- dangerous git operations (force push, `reset --hard`, history rewrite)
- remote code execution patterns (`eval` of fetched content)
- credential/keystore access (`~/.ssh`, `~/.aws`, keyrings, browser profiles)
- unexpected network egress

**Honest caveat:** these heuristics catch careless and naive-malicious content. They do not catch a
competent adversary, and the risk score must not be presented as a safety guarantee. Its purpose is
to *prioritize human review*, not to replace it. The actual safety property comes from §1: external
code is not executed, and external content never gains authority.

---

## 8. Permissions

Skills declare what they need (§36). Nothing is granted implicitly.

Declarable: `filesystem.read`, `filesystem.write`, `network`, `shell`, `git`, `database`,
`browser`, `secrets`, `deployment`.

Rules:
- Principle of least privilege. Undeclared → denied.
- Declared → still requires explicit human grant per skill.
- `shell`, `secrets`, `deployment` are **never** granted to `external_approved` skills.
- A permission request is itself a risk signal worth surfacing in review.

---

## 9. Script execution

**Default: third-party scripts are not executed.** A skill's scripts are stored, hashed, displayed
for review, and analysed — but not run.

If execution is ever enabled, all of the following are required simultaneously (§38):
explicit per-skill human approval; isolated execution (no host filesystem, no host network);
CPU/RAM/timeout limits; no secret access; recorded audit entry; and a reviewed diff on every
version change.

Rationale for the strict default: not running code is a stronger guarantee than any sandbox, and
the engine's value comes from *instructions*, not from third-party scripts. The feature is
low-benefit and high-risk, which is the correct profile for "don't build it".

---

## 10. Versioning & upstream updates

Per §7 and §8:

- Skills are never silently overwritten. Every change creates a version with `parent_version`,
  `content_hash`, `change_reason`, `status`.
- An upstream change creates a **candidate** version. It does not activate.
- Candidate must pass: security scan → licence scan → tests → benchmark → diff review → approval.
- The currently-approved production version remains active throughout.
- `skill diff` must surface changes to instructions, scripts, permissions, dependencies, licence,
  and risk (§85). A permission or script change between versions is a high-signal review trigger.

---

## 11. Human approval — required for

Per §97, no automation may bypass these:

- activating any external skill
- any permission escalation
- enabling script execution for a skill
- any licence override or copyleft/unknown-licence decision
- deleting a skill
- production deployment

---

## 12. Deletion & rollback

Skills are `deprecated`/`archived`/`blocked` rather than hard-deleted, so that provenance and past
benchmark results remain interpretable. Rollback to a previous approved version must be possible
(§99).

---

## 13. Policy review triggers

Revisit this document when: a new source type is added; script execution is proposed; a hosted
model provider is introduced; the engine gains filesystem write access outside its output
directory; or the site begins publishing imported content.
