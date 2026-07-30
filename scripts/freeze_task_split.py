#!/usr/bin/env python3
"""Freeze the DEV/HOLDOUT split of the H1 task set, and the pilot subset.

Run BEFORE the first model call. Both outputs are committed before any provider
is contacted, so neither can be chosen after seeing a result.

WHY THIS EXISTS
---------------
The task set had no split at all. The retrieval query set has one (19 dev /
13 holdout) but that is a different artifact. Running a pilot against unsplit
tasks would consume the whole set: there would be no untouched holdout left for
the final H1 evaluation, and every later number would be reported on data the
harness had already been tuned against.

SPLIT RULE (deterministic, documented, seeded)
----------------------------------------------
Stratify by (domain, language) so neither split ends up missing a task type or
a language. Within each stratum, order by task_id and assign alternately,
starting from a per-stratum offset derived from a fixed seed. Target ~60% dev.

No randomness beyond the fixed seed, so re-running reproduces the split exactly.

PILOT SUBSET RULE
-----------------
From DEV tasks that are H1-eligible, pick 10 covering:
  - as many distinct domains as possible (at most one per domain first)
  - the full range of deterministic-check counts (low/mid/high tertiles)
  - both languages
  - at least 3 tasks carrying proxy checks
  - none of the three language-gap diagnostic tasks

Selection is by rule, never by expected result.
"""
import json
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TASKS = ROOT / "benchmarks/tasks/v1/tasks.json"
EVALS = ROOT / "benchmarks/tasks/v1/evaluation.json"
SPLIT_OUT = ROOT / "benchmarks/tasks/v1/splits.json"
PILOT_OUT = ROOT / "benchmarks/tasks/v1/pilot-subset.json"

SPLIT_SEED = 20260730
DEV_SHARE = 0.6
PILOT_SIZE = 10

# Retrieval finds nothing for these: German compounds absent from a ~91% English
# corpus. Kept in the task set as diagnostics, excluded from the pilot because
# arms B/D would be byte-identical to A.
LANGUAGE_GAP = {"T017", "T021", "T027"}

DETERMINISTIC_KINDS = {
    "contains", "absent", "regex", "element", "attribute",
    "handler", "count_min", "breakpoint", "import_absent", "artifact", "any_of",
}


def stable_offset(key: str) -> int:
    """A per-stratum starting offset that depends only on the key and the seed."""
    h = hashlib.sha256(f"{SPLIT_SEED}:{key}".encode()).hexdigest()
    return int(h[:8], 16)


def main() -> int:
    tasks = json.loads(TASKS.read_text())["tasks"]
    evals = json.loads(EVALS.read_text())["evaluations"]

    # --- split -----------------------------------------------------------
    strata: dict[str, list[dict]] = {}
    for t in tasks:
        strata.setdefault(f"{t['domain']}|{t['language']}", []).append(t)

    dev, holdout = [], []
    for key in sorted(strata):
        members = sorted(strata[key], key=lambda t: t["task_id"])
        off = stable_offset(key)
        for i, t in enumerate(members):
            # Alternate, but start the alternation at a stratum-specific offset
            # so small strata do not all send their first member to dev.
            (dev if ((i + off) % 10) < DEV_SHARE * 10 else holdout).append(t["task_id"])

    dev, holdout = sorted(dev), sorted(holdout)
    assert not set(dev) & set(holdout)
    assert len(dev) + len(holdout) == len(tasks)

    split = {
        "version": "task-split-v1",
        "seed": SPLIT_SEED,
        "rule": (
            "Stratify by (domain, language); within a stratum order by task_id and "
            "assign alternately from a stratum-specific offset derived from the seed. "
            "Target ~60% dev. Deterministic: re-running reproduces it exactly."
        ),
        "note": (
            "HOLDOUT IS NOT TO BE MEASURED during development, including by the pilot. "
            "It exists so the final H1 evaluation has data the harness was never tuned "
            "against. Spending it early cannot be undone."
        ),
        "dev": dev,
        "holdout": holdout,
    }
    SPLIT_OUT.write_text(json.dumps(split, indent=1, ensure_ascii=False) + "\n")

    # --- pilot subset ----------------------------------------------------
    def det_count(tid: str) -> int:
        ev = evals[tid]
        return sum(1 for a in ev["assertions"] if a["kind"] in DETERMINISTIC_KINDS) + len(ev["forbidden"])

    def has_proxy(tid: str) -> bool:
        return any(a.get("proxy") for a in evals[tid]["assertions"])

    by_id = {t["task_id"]: t for t in tasks}
    candidates = [tid for tid in dev if tid not in LANGUAGE_GAP]
    candidates.sort(key=lambda tid: (-det_count(tid), tid))

    # Tertiles by deterministic-check count, so the pilot exercises tasks that
    # are cheap to settle and tasks that are not.
    n = len(candidates)
    tertiles = [candidates[: n // 3], candidates[n // 3: 2 * n // 3], candidates[2 * n // 3:]]

    picked: list[str] = []
    seen_domains: set[str] = set()
    # Pass 1: one per domain, rotating tertiles and alternating language.
    want_lang = "de"
    for tier in range(3):
        for tid in tertiles[tier]:
            if len(picked) >= PILOT_SIZE:
                break
            t = by_id[tid]
            if t["domain"] in seen_domains or t["language"] != want_lang:
                continue
            picked.append(tid)
            seen_domains.add(t["domain"])
            want_lang = "en" if want_lang == "de" else "de"
    # Pass 2: relax the language alternation, keep one-per-domain.
    for tier in range(3):
        for tid in tertiles[tier]:
            if len(picked) >= PILOT_SIZE:
                break
            if by_id[tid]["domain"] in seen_domains or tid in picked:
                continue
            picked.append(tid)
            seen_domains.add(by_id[tid]["domain"])
    # Pass 3: relax one-per-domain to reach the target size.
    for tid in candidates:
        if len(picked) >= PILOT_SIZE:
            break
        if tid not in picked:
            picked.append(tid)

    picked = sorted(picked)
    proxies = [tid for tid in picked if has_proxy(tid)]

    pilot = {
        "version": "pilot-subset-v1",
        "selected_before_any_model_call": True,
        "rule": (
            "DEV tasks only, H1-eligible, excluding the three language-gap diagnostics. "
            "Ordered by deterministic-check count descending then task_id; split into "
            "tertiles; picked one per domain rotating tertiles and alternating language, "
            "then relaxing language, then relaxing one-per-domain, until 10. "
            "Never selected by expected or observed result."
        ),
        "excluded_language_gap": sorted(LANGUAGE_GAP),
        "task_ids": picked,
        "coverage": {
            "count": len(picked),
            "domains": sorted({by_id[t]["domain"] for t in picked}),
            "languages": sorted({by_id[t]["language"] for t in picked}),
            "deterministic_checks": {t: det_count(t) for t in picked},
            "tasks_with_proxy_checks": proxies,
        },
    }
    PILOT_OUT.write_text(json.dumps(pilot, indent=1, ensure_ascii=False) + "\n")

    print(f"dev={len(dev)} holdout={len(holdout)}")
    print(f"pilot={len(picked)}: {' '.join(picked)}")
    print(f"  domains: {len(pilot['coverage']['domains'])}  languages: {pilot['coverage']['languages']}")
    print(f"  deterministic checks: {sorted(pilot['coverage']['deterministic_checks'].values())}")
    print(f"  with proxy checks: {len(proxies)}")
    if len(proxies) < 3:
        print("  FAIL: fewer than 3 tasks carry proxy checks", file=sys.stderr)
        return 1
    if len(set(pilot["coverage"]["languages"])) < 2:
        print("  FAIL: the pilot is monolingual", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
