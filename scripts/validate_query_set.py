#!/usr/bin/env python3
"""Validate the retrieval ground truth (ENG-005).

Checks structural integrity, split hygiene, dataset consistency and — most
importantly — that the ground truth was NOT derived from capability labels.
A circular ground truth would make the R3 ablation score itself.

Usage: python3 scripts/validate_query_set.py [--check]
"""
import json, sys, glob
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent.parent
Q = ROOT / "benchmarks" / "queries"
VALID_GRADES = {0, 1, 2, 3}

def main():
    errs, warns = [], []
    queries = json.loads((Q / "queries.json").read_text(encoding="utf-8"))
    rel     = json.loads((Q / "relevance.json").read_text(encoding="utf-8"))
    pool    = json.loads((Q / "candidate-pool.json").read_text(encoding="utf-8"))

    ids = [q["id"] for q in queries["queries"]]
    if len(ids) != len(set(ids)): errs.append("duplicate query ids")
    for q in queries["queries"]:
        if not q.get("query", "").strip(): errs.append(f"{q['id']}: empty query string")
        if q["split"] not in ("dev", "holdout"): errs.append(f"{q['id']}: bad split {q['split']}")
        for f in ("language", "type", "difficulty", "intent"):
            if not q.get(f): errs.append(f"{q['id']}: missing {f}")

    # a query may never be in both splits
    splits = {}
    for q in queries["queries"]:
        if q["id"] in splits and splits[q["id"]] != q["split"]:
            errs.append(f"{q['id']}: appears in two splits")
        splits[q["id"]] = q["split"]

    # every dataset record referenced must exist
    known = set()
    for f in sorted(glob.glob(str(ROOT / "data" / "*.jsonl"))):
        for l in open(f, encoding="utf-8"):
            if l.strip(): known.add(json.loads(l)["id"])

    for qid, v in rel["queries"].items():
        if qid not in splits: errs.append(f"relevance references unknown query {qid}")
        for rid, g in v["relevance"].items():
            if rid not in known: errs.append(f"{qid}: unknown record {rid}")
            if g not in VALID_GRADES: errs.append(f"{qid}/{rid}: bad grade {g}")
            if g == 0: errs.append(f"{qid}/{rid}: grade 0 must live in judged_not_relevant")
        for rid in v["judged_not_relevant"]:
            if rid not in known: errs.append(f"{qid}: unknown record {rid}")
            if rid in v["relevance"]: errs.append(f"{qid}/{rid}: graded twice")
        # judged set must be exactly the pool
        judged = set(v["relevance"]) | set(v["judged_not_relevant"])
        pooled = set(pool["pool"][qid]["candidate_ids"])
        if judged != pooled:
            errs.append(f"{qid}: judged set != candidate pool ({len(judged)} vs {len(pooled)})")
        if v.get("expected_relevant_count") == 0 and v["relevance"]:
            errs.append(f"{qid}: declared zero-result but has graded-relevant records")

    # versioning must be present and consistent
    for k in ("ground_truth_version", "dataset_hash", "created_at", "query_schema_version"):
        if not rel.get(k): errs.append(f"relevance.json missing {k}")
    if rel.get("dataset_hash") != pool.get("dataset_hash"):
        errs.append("dataset_hash differs between relevance.json and candidate-pool.json")
    if not rel.get("frozen"): errs.append("ground truth is not marked frozen")

    # --- circularity ban -------------------------------------------------
    cap_file = ROOT / "reports" / "capabilities.json"
    if cap_file.exists():
        caps = json.loads(cap_file.read_text(encoding="utf-8"))["per_record"]
        for qid, v in rel["queries"].items():
            graded = set(v["relevance"])
            if not graded: continue
            # If the relevant set were derived from capability labels it would be
            # an exact capability cohort. Flag a suspiciously perfect alignment.
            sets = [frozenset(caps[r]["high"] + caps[r]["medium"]) for r in graded if r in caps]
            if len(sets) > 3 and len(set(sets)) == 1:
                errs.append(f"{qid}: every relevant record has an identical capability set — "
                            "ground truth may have been derived from capability labels")

    # split balance
    ann = {qid: splits[qid] for qid in rel["queries"]}
    c = Counter(ann.values())
    if min(c.values() or [0]) == 0: errs.append("one split has no annotated queries")
    if c["holdout"] < 3: warns.append(f"only {c['holdout']} holdout queries — thin for a final measurement")

    langs = Counter(rel["queries"][q]["language"] for q in rel["queries"])
    if len(langs) < 2: warns.append("query set is single-language")

    for qid, v in rel["queries"].items():
        n = len(v["relevance"])
        if n == 0 and v.get("expected_relevant_count") != 0:
            warns.append(f"{qid}: no relevant record and not declared zero-result")
        if n > 30: warns.append(f"{qid}: {n} relevant records — very broad")

    for w in warns: print(f"WARN  {w}")
    for e in errs:  print(f"ERROR {e}")
    print(f"\n{len(rel['queries'])} annotated queries, "
          f"{sum(v['judged'] for v in rel['queries'].values())} judged pairs, "
          f"{len(errs)} errors, {len(warns)} warnings")
    return 1 if errs else 0

if __name__ == "__main__":
    sys.exit(main())
