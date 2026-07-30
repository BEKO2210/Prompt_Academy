#!/usr/bin/env python3
"""Evaluate a retrieval method against the frozen ground truth (ENG-005).

Measurement only. This script implements NO new ranking: it evaluates methods
that already exist in the product, so the first numbers are a baseline rather
than a result someone tuned toward.

DEV SPLIT BY DEFAULT. The holdout is frozen for a final measurement and must not
be touched while a ranker is being developed — measuring it repeatedly would
turn it into a tuning set, which is the failure ENG-005 exists to prevent.
Running --split holdout requires --i-am-doing-the-final-measurement.

Usage:
    python3 scripts/eval_retrieval.py                 # dev, all methods
    python3 scripts/eval_retrieval.py --method r1_and_terms
    python3 scripts/eval_retrieval.py --per-query
"""
import argparse, json, glob, math, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
Q = ROOT / "benchmarks" / "queries"
K_VALUES = [1, 3, 5, 10]


def load_records():
    recs = []
    for f in sorted(glob.glob(str(ROOT / "data" / "*.jsonl"))):
        for l in open(f, encoding="utf-8"):
            if l.strip():
                recs.append(json.loads(l))
    return recs


def haystack(r):
    """The exact field set site/src/lib/search.ts concatenates."""
    return " ".join([
        r["title"],
        r.get("website_card", {}).get("headline", r["title"]),
        r.get("website_card", {}).get("summary", ""),
        r.get("tech_stack", {}).get("framework", ""),
        r["industry"], r["subcategory"], r["audience"],
        *r.get("tags", []),
        *r.get("website_card", {}).get("search_keywords", []),
    ]).lower()


# --- retrieval methods under test ----------------------------------------
# Both are what the product actually did / does. Neither is new work.

def r0_substring(query, recs, hays):
    """Pre-ENG-010 behaviour: one substring test. The historical baseline."""
    q = query.lower().strip()
    return [r["id"] for r, h in zip(recs, hays) if q in h]


def r1_and_terms(query, recs, hays):
    """Shipped behaviour since ENG-010: every query term must appear."""
    terms = [t for t in query.lower().split() if t]
    return [r["id"] for r, h in zip(recs, hays) if all(t in h for t in terms)]


METHODS = {"r0_substring": r0_substring, "r1_and_terms": r1_and_terms}


# --- metrics --------------------------------------------------------------

def dcg(gains):
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def evaluate(ranked, rel, k_values):
    """rel: {record_id: grade}. Unjudged records count as grade 0 (pooled
    evaluation convention, recorded in relevance.json)."""
    gains = [rel.get(rid, 0) for rid in ranked]
    n_rel = sum(1 for g in rel.values() if g > 0)
    out = {}
    for k in k_values:
        top = gains[:k]
        hits = sum(1 for g in top if g > 0)
        out[f"precision@{k}"] = hits / k if k else 0.0
        out[f"recall@{k}"] = (hits / n_rel) if n_rel else None
        out[f"hit_rate@{k}"] = 1.0 if hits else 0.0
        ideal = sorted(rel.values(), reverse=True)[:k]
        idcg = dcg(ideal)
        out[f"ndcg@{k}"] = (dcg(top) / idcg) if idcg else None
    rr = 0.0
    for i, g in enumerate(gains):
        if g > 0:
            rr = 1.0 / (i + 1)
            break
    out["mrr"] = rr
    out["returned"] = len(ranked)
    out["relevant_total"] = n_rel
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="dev", choices=["dev", "holdout"])
    ap.add_argument("--method", choices=list(METHODS))
    ap.add_argument("--per-query", action="store_true")
    ap.add_argument("--i-am-doing-the-final-measurement", action="store_true")
    ap.add_argument("--out", metavar="FILE")
    args = ap.parse_args()

    if args.split == "holdout" and not args.i_am_doing_the_final_measurement:
        sys.exit("REFUSED: the holdout is frozen for the final measurement.\n"
                 "Measuring it during development turns it into a tuning set.\n"
                 "Pass --i-am-doing-the-final-measurement if that is genuinely what this is.")

    rel_all = json.loads((Q / "relevance.json").read_text(encoding="utf-8"))
    recs = load_records()
    hays = [haystack(r) for r in recs]

    qs = {qid: v for qid, v in rel_all["queries"].items() if v["split"] == args.split}
    methods = {args.method: METHODS[args.method]} if args.method else METHODS

    report = {
        "ground_truth_version": rel_all["ground_truth_version"],
        "dataset_hash": rel_all["dataset_hash"],
        "split": args.split,
        "queries": len(qs),
        "k_values": K_VALUES,
        "unjudged_convention": rel_all["unjudged_convention"],
        "note": "No new ranking was implemented for this measurement. Both methods are what the product did or does.",
        "methods": {},
    }

    for name, fn in methods.items():
        per_q, agg = {}, {}
        for qid, v in sorted(qs.items()):
            ranked = fn(v["query"], recs, hays)
            m = evaluate(ranked, {k: int(g) for k, g in v["relevance"].items()}, K_VALUES)
            m["query"] = v["query"]
            m["language"] = v["language"]
            m["zero_result_expected"] = v.get("expected_relevant_count") == 0
            per_q[qid] = m
        keys = [f"{p}@{k}" for p in ("precision", "recall", "hit_rate", "ndcg") for k in K_VALUES] + ["mrr"]
        for key in keys:
            vals = [m[key] for m in per_q.values()
                    if m.get(key) is not None and not m["zero_result_expected"]]
            agg[key] = round(sum(vals) / len(vals), 4) if vals else None
        # zero-result queries are scored separately: success is returning nothing
        zr = {qid: m for qid, m in per_q.items() if m["zero_result_expected"]}
        agg["zero_result_queries"] = len(zr)
        agg["zero_result_correctly_empty"] = sum(1 for m in zr.values() if m["returned"] == 0)
        agg["zero_result_false_positives"] = sum(m["returned"] for m in zr.values())
        report["methods"][name] = {"aggregate": agg, "per_query": per_q}

    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"split={args.split}  queries={len(qs)}  ground_truth={report['ground_truth_version']}\n")
    hdr = f"{'method':16}" + "".join(f"{m:>10}" for m in ("P@1", "P@5", "R@10", "nDCG@10", "MRR"))
    print(hdr); print("-" * len(hdr))
    for name, d in report["methods"].items():
        a = d["aggregate"]
        row = f"{name:16}"
        for key in ("precision@1", "precision@5", "recall@10", "ndcg@10", "mrr"):
            v = a[key]
            row += f"{v:>10.3f}" if v is not None else f"{'—':>10}"
        print(row)
    print()
    for name, d in report["methods"].items():
        a = d["aggregate"]
        print(f"{name}: zero-result queries {a['zero_result_correctly_empty']}/{a['zero_result_queries']} "
              f"correctly empty ({a['zero_result_false_positives']} false hits)")

    if args.per_query:
        print()
        for name, d in report["methods"].items():
            print(f"\n=== {name} ===")
            print(f"{'query':38}{'lang':>5}{'ret':>6}{'rel':>5}{'P@1':>6}{'P@5':>6}{'R@10':>7}{'nDCG@10':>9}")
            for qid, m in d["per_query"].items():
                r10 = f"{m['recall@10']:.2f}" if m["recall@10"] is not None else "—"
                n10 = f"{m['ndcg@10']:.2f}" if m["ndcg@10"] is not None else "—"
                print(f"{qid} {m['query'][:33]:34}{m['language']:>5}{m['returned']:>6}"
                      f"{m['relevant_total']:>5}{m['precision@1']:>6.2f}{m['precision@5']:>6.2f}{r10:>7}{n10:>9}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
