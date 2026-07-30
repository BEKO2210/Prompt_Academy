#!/usr/bin/env python3
"""
Candidate pooling for the retrieval ground truth (ENG-005).

Judging 10,000 records against every query is not feasible, so candidates are
POOLED from several independent recall sources and only the pool is judged.

The rule that makes this sound: a pooling source may PROPOSE a record. It may
never assign a grade. Grades come from a human reading the record against
benchmarks/queries/RELEVANCE-GUIDELINE.md. Nothing here writes a relevance
value.

The blinded output deliberately strips, before the annotator sees anything:
  - which source proposed the record
  - its rank or score in any source
  - all capability labels
and shuffles with a recorded seed. Otherwise the ground truth would ratify
whatever the current search already does, which is the failure this whole
ticket exists to avoid.

Usage:
    python3 scripts/pool_candidates.py --pool          # write the pool
    python3 scripts/pool_candidates.py --blind Q002    # blinded view for judging
    python3 scripts/pool_candidates.py --bias-report   # pooling bias analysis
"""

import argparse
import hashlib
import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
Q_DIR = ROOT / "benchmarks" / "queries"
QUERIES_FILE = Q_DIR / "queries.json"
POOL_FILE = Q_DIR / "candidate-pool.json"

SHUFFLE_SEED = 20260730
PER_SOURCE_CAP = 14   # keep the pool judgeable; recorded so truncation is visible


def load_records():
    recs = []
    for path in sorted(DATA_DIR.glob("*.jsonl")):
        for line in path.open(encoding="utf-8"):
            line = line.strip()
            if line:
                recs.append(json.loads(line))
    return recs


def dataset_hash(recs):
    h = hashlib.sha256()
    for r in sorted(recs, key=lambda r: r["id"]):
        h.update(r["id"].encode())
        h.update(r["prompt"].encode("utf-8"))
    return h.hexdigest()


def searchable(r):
    """Everything a lexical source may look at. NOT capability labels."""
    return " ".join([
        r["title"], r["prompt"], r.get("negative_prompt", ""),
        " ".join(r.get("acceptance_criteria", [])),
        " ".join(r.get("tags", [])),
        r["subcategory"].replace("_", " "), r["category"].replace("_", " "),
        r.get("website_card", {}).get("headline", ""),
        r.get("website_card", {}).get("summary", ""),
    ]).lower()


# --- recall sources -------------------------------------------------------
# Each returns record ids. Independent on purpose: a record found by only one
# source is exactly the kind of case that reveals a ranker's blind spot.

def src_substring(recs, texts, query):
    """What the CURRENT site does: one substring test over the haystack."""
    q = query.lower().strip()
    return [r["id"] for r, t in zip(recs, texts) if q in t]


def src_all_terms(recs, texts, query):
    """ENG-010's shipped predicate: every term must appear."""
    terms = [t for t in query.lower().split() if t]
    return [r["id"] for r, t in zip(recs, texts) if all(x in t for x in terms)]


def src_any_term(recs, texts, query, min_terms=1):
    """Loose OR recall — deliberately noisy, to widen the pool."""
    terms = [re.escape(t) for t in query.lower().split() if len(t) > 2]
    if not terms:
        return []
    rx = [re.compile(r"\b" + t) for t in terms]
    out = []
    for r, t in zip(recs, texts):
        if sum(1 for x in rx if x.search(t)) >= min_terms:
            out.append((r["id"], sum(1 for x in rx if x.search(t))))
    out.sort(key=lambda p: -p[1])
    return [i for i, _ in out]


def src_facet(recs, texts, query, expansions):
    """Category/subcategory match via hand-written query expansions."""
    keys = expansions.get("facets", [])
    if not keys:
        return []
    return [r["id"] for r in recs
            if r["subcategory"] in keys or r["category"] in keys]


def src_synonyms(recs, texts, query, expansions):
    """Independent vocabulary variants, hand-written per query.

    This is the source that catches vocabulary mismatch ('sign in' -> 'login')
    and cross-language ('Preisseite' -> 'pricing'). Written by hand precisely so
    it does not inherit any ranker's notion of similarity."""
    syns = expansions.get("synonyms", [])
    if not syns:
        return []
    rx = [re.compile(r"\b" + re.escape(s.lower())) for s in syns]
    scored = []
    for r, t in zip(recs, texts):
        n = sum(1 for x in rx if x.search(t))
        if n:
            scored.append((r["id"], n))
    scored.sort(key=lambda p: -p[1])
    return [i for i, _ in scored]


def src_facet_and_synonym(recs, texts, query, expansions):
    """Records matching the facet AND at least one synonym.

    Added after a measured pooling failure: for "accessible dashboard" the
    per-source cap truncated both the facet list and the synonym list before
    their INTERSECTION surfaced, so the pool contained no record that was both a
    dashboard and accessible. A two-part need requires a conjunctive source."""
    keys = set(expansions.get("facets", []))
    syns = expansions.get("synonyms", [])
    if not keys or not syns:
        return []
    rx = [re.compile(r"\b" + re.escape(s.lower())) for s in syns]
    scored = []
    for r, t in zip(recs, texts):
        if r["subcategory"] in keys or r["category"] in keys:
            n = sum(1 for x in rx if x.search(t))
            if n:
                scored.append((r["id"], n))
    scored.sort(key=lambda p: -p[1])
    return [i for i, _ in scored]


def build_pool(expansions):
    recs = load_records()
    texts = [searchable(r) for r in recs]
    by_id = {r["id"]: r for r in recs}
    qs = json.loads(QUERIES_FILE.read_text(encoding="utf-8"))

    pool = {}
    for q in qs["queries"]:
        exp = expansions.get(q["id"], {})
        sources = {
            "substring": src_substring(recs, texts, q["query"]),
            "all_terms": src_all_terms(recs, texts, q["query"]),
            "any_term": src_any_term(recs, texts, q["query"]),
            "facet": src_facet(recs, texts, q["query"], exp),
            "synonyms": src_synonyms(recs, texts, q["query"], exp),
            "facet_and_synonym": src_facet_and_synonym(recs, texts, q["query"], exp),
        }
        provenance = defaultdict(list)
        truncated = {}
        for name, ids in sources.items():
            if len(ids) > PER_SOURCE_CAP:
                truncated[name] = len(ids)
            for rid in ids[:PER_SOURCE_CAP]:
                provenance[rid].append(name)

        ids = sorted(provenance)
        rng = random.Random(f"{SHUFFLE_SEED}:{q['id']}")
        rng.shuffle(ids)

        pool[q["id"]] = {
            "query": q["query"],
            "candidate_ids": ids,
            "provenance": {k: sorted(v) for k, v in provenance.items()},
            "source_totals": {k: len(v) for k, v in sources.items()},
            "source_truncated_at_cap": truncated,
            "shuffle_seed": f"{SHUFFLE_SEED}:{q['id']}",
        }

    return {
        "pool_schema_version": "1.0.0",
        "ground_truth_version": qs["ground_truth_version"],
        "dataset_hash": dataset_hash(recs),
        "per_source_cap": PER_SOURCE_CAP,
        "shuffle_seed_base": SHUFFLE_SEED,
        "sources": {
            "substring": "current live site behaviour — one substring test over the haystack",
            "all_terms": "ENG-010 shipped predicate — every query term must appear",
            "any_term": "loose OR over terms, ranked by term count — deliberately noisy",
            "facet": "hand-written category/subcategory expansion per query",
            "synonyms": "hand-written vocabulary variants per query, incl. German↔English",
            "facet_and_synonym": "intersection of facet and synonym — added after a measured pooling failure on Q002, see the coverage report",
        },
        "rule": "Sources PROPOSE candidates. Sources never assign relevance. Grades come from a human reading the record against RELEVANCE-GUIDELINE.md.",
        "pool": pool,
        "_by_id_count": len(by_id),
    }


def blind(pool, qid, limit=None):
    """Annotator view: no source, no rank, no score, no capability labels."""
    recs = {r["id"]: r for r in load_records()}
    p = pool["pool"][qid]
    out = []
    for rid in (p["candidate_ids"][:limit] if limit else p["candidate_ids"]):
        r = recs[rid]
        out.append({
            "id": rid,
            "title": r["title"],
            "category": r["category"],
            "subcategory": r["subcategory"],
            "prompt": r["prompt"],
        })
    return {"query_id": qid, "query": p["query"], "n": len(out), "candidates": out}


def bias_report(pool):
    """Pooling bias must be stated, not discovered later."""
    only_one, per_source, overlap = Counter(), Counter(), Counter()
    for qid, p in pool["pool"].items():
        for rid, srcs in p["provenance"].items():
            per_source.update(srcs)
            overlap[len(srcs)] += 1
            if len(srcs) == 1:
                only_one[srcs[0]] += 1
    return {
        "candidates_by_source": dict(per_source.most_common()),
        "candidates_found_by_n_sources": dict(sorted(overlap.items())),
        "uniquely_contributed_by": dict(only_one.most_common()),
        "pool_sizes": {q: len(p["candidate_ids"]) for q, p in pool["pool"].items()},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", action="store_true")
    ap.add_argument("--blind", metavar="QID")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--bias-report", action="store_true")
    args = ap.parse_args()

    exp_file = Q_DIR / "query-expansions.json"
    expansions = json.loads(exp_file.read_text(encoding="utf-8")) if exp_file.exists() else {}

    if args.pool:
        pool = build_pool(expansions)
        POOL_FILE.write_text(json.dumps(pool, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        sizes = [len(p["candidate_ids"]) for p in pool["pool"].values()]
        print(f"✓ {len(pool['pool'])} queries pooled -> {POOL_FILE.relative_to(ROOT)}")
        print(f"  candidates: total={sum(sizes)} min={min(sizes)} max={max(sizes)} "
              f"mean={sum(sizes)/len(sizes):.1f}")
        print(f"  dataset_hash={pool['dataset_hash'][:16]}")
        return 0

    pool = json.loads(POOL_FILE.read_text(encoding="utf-8"))

    if args.blind:
        json.dump(blind(pool, args.blind, args.limit), sys.stdout, indent=2, ensure_ascii=False)
        print()
        return 0

    if args.bias_report:
        json.dump(bias_report(pool), sys.stdout, indent=2, ensure_ascii=False)
        print()
        return 0

    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
