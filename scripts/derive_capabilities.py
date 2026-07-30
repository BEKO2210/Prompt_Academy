#!/usr/bin/env python3
"""
Derive capabilities[] for every record from deterministic rules (ENG-001).

No model is involved. Same dataset + same rules file always produce the same
output; `--check` fails if the committed manifest is stale, exactly like
compute_content_hashes.py.

Two evidence tiers, per schema/capabilities.rules.json:
  high    an acceptance_criterion matched, or the subcategory IS the capability
  medium  matched only in prompt text or tags
Anything matching only inside a negation window, or only in negative_prompt,
is emitted as UNCERTAIN and never counted as an assigned capability — the
brief was to mark uncertainty rather than guess.

Usage:
    python3 scripts/derive_capabilities.py            # write manifest + report
    python3 scripts/derive_capabilities.py --check    # CI: fail if stale
    python3 scripts/derive_capabilities.py --sample 40 --seed 7
                                                      # stratified review sample
"""

import argparse
import hashlib
import json
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
SCHEMA_DIR = ROOT / "schema"
REPORTS_DIR = ROOT / "reports"
VOCAB_FILE = SCHEMA_DIR / "capabilities.vocabulary.json"
RULES_FILE = SCHEMA_DIR / "capabilities.rules.json"
OUT_FILE = REPORTS_DIR / "capabilities.json"
COVERAGE_FILE = REPORTS_DIR / "capabilities-coverage.md"


def load_config():
    vocab = json.loads(VOCAB_FILE.read_text(encoding="utf-8"))
    rules = json.loads(RULES_FILE.read_text(encoding="utf-8"))
    if rules["vocabulary_version"] != vocab["vocabulary_version"]:
        sys.exit(
            f"Version mismatch: rules expect vocabulary {rules['vocabulary_version']}, "
            f"vocabulary is {vocab['vocabulary_version']}"
        )
    known = {c["id"] for c in vocab["capabilities"]}
    for cap in list(rules["text_rules"]) + [
        c for caps in rules["subcategory_rules"].values()
        if isinstance(caps, list) for c in caps
    ]:
        if cap not in known:
            sys.exit(f"Rule references unknown capability: {cap}")
    compiled = {
        cap: [re.compile(p, re.IGNORECASE) for p in spec["patterns"]]
        for cap, spec in rules["text_rules"].items()
    }
    return vocab, rules, compiled, known


def load_records():
    files = sorted(DATA_DIR.glob("*.jsonl"))
    if not files:
        sys.exit(f"No .jsonl files in {DATA_DIR}")
    for path in files:
        for lineno, line in enumerate(path.open(encoding="utf-8"), 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                sys.exit(f"{path.name}:{lineno}: invalid JSON: {exc}")


def is_negated(text, start, markers, window):
    """True if a negation marker sits within `window` chars before the match."""
    ctx = text[max(0, start - window):start].lower()
    return any(m in ctx for m in markers)


def scan(text, patterns, markers, window):
    """Return (hit, negated_only). hit=True if any non-negated match exists."""
    saw_any = False
    for rx in patterns:
        for m in rx.finditer(text):
            saw_any = True
            if not is_negated(text, m.start(), markers, window):
                return True, False
    return False, saw_any


def derive(record, rules, compiled):
    neg = rules["negated_context"]
    markers, window = neg["markers"], neg["window_chars"]

    ac_text = " ".join(record.get("acceptance_criteria", []))
    medium_text = " ".join([record.get("prompt", "")] + list(record.get("tags", [])))
    negative_text = record.get("negative_prompt", "")

    high, medium, uncertain = set(), set(), {}

    for cap in rules["subcategory_rules"]:
        if cap == "_note":
            continue
        if record.get("subcategory") == cap:
            high.update(rules["subcategory_rules"][cap])

    for cap, patterns in compiled.items():
        hit_ac, neg_ac = scan(ac_text, patterns, markers, window)
        if hit_ac:
            high.add(cap)
            continue
        hit_md, neg_md = scan(medium_text, patterns, markers, window)
        if hit_md:
            medium.add(cap)
            continue
        # Only mentioned in what to AVOID, or only inside a negation window.
        hit_np, _ = scan(negative_text, patterns, markers, window)
        if neg_ac or neg_md or hit_np:
            reason = "negated_context" if (neg_ac or neg_md) else "negative_prompt_only"
            uncertain[cap] = reason

    medium -= high
    for cap in list(uncertain):
        if cap in high or cap in medium:
            del uncertain[cap]

    return sorted(high), sorted(medium), dict(sorted(uncertain.items()))


def build():
    vocab, rules, compiled, known = load_config()
    per_record, cap_counts, conf_counts = {}, Counter(), Counter()
    uncertain_counts, uncertain_reasons = Counter(), Counter()
    per_category = defaultdict(Counter)
    none_assigned = []

    total = 0
    for r in load_records():
        total += 1
        high, medium, uncertain = derive(r, rules, compiled)
        assigned = high + medium
        per_record[r["id"]] = {
            "high": high,
            "medium": medium,
            "uncertain": uncertain,
        }
        for c in high:
            cap_counts[c] += 1
            conf_counts["high"] += 1
            per_category[r["category"]][c] += 1
        for c in medium:
            cap_counts[c] += 1
            conf_counts["medium"] += 1
            per_category[r["category"]][c] += 1
        for c, why in uncertain.items():
            uncertain_counts[c] += 1
            uncertain_reasons[why] += 1
        if not assigned:
            none_assigned.append(r["id"])

    covered = total - len(none_assigned)
    per_rec_counts = [len(v["high"]) + len(v["medium"]) for v in per_record.values()]

    # Version strings are hand-maintained and therefore forgettable. Hashing the
    # actual config catches an edit that changes rules without changing labels —
    # measured gap: adding a redundant pattern passed --check silently.
    config_hash = hashlib.sha256(
        (VOCAB_FILE.read_text(encoding="utf-8") + RULES_FILE.read_text(encoding="utf-8"))
        .encode("utf-8")
    ).hexdigest()

    return {
        "vocabulary_version": vocab["vocabulary_version"],
        "rules_version": rules["rules_version"],
        "config_hash": config_hash,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": "deterministic rules only — no model involved",
        "total_records": total,
        "records_with_at_least_one_capability": covered,
        "coverage_pct": round(100 * covered / total, 2) if total else 0,
        "records_without_capability": none_assigned[:50],
        "records_without_capability_count": len(none_assigned),
        "capabilities_per_record": {
            "min": min(per_rec_counts) if per_rec_counts else 0,
            "max": max(per_rec_counts) if per_rec_counts else 0,
            "mean": round(sum(per_rec_counts) / len(per_rec_counts), 2) if per_rec_counts else 0,
        },
        "assignments_by_confidence": dict(conf_counts),
        "capability_frequency": dict(cap_counts.most_common()),
        "capability_frequency_pct": {
            k: round(100 * v / total, 1) for k, v in cap_counts.most_common()
        },
        "unused_capabilities": sorted(known - set(cap_counts)),
        "uncertain_frequency": dict(uncertain_counts.most_common()),
        "uncertain_reasons": dict(uncertain_reasons),
        "per_category": {k: dict(v.most_common()) for k, v in sorted(per_category.items())},
        "per_record": per_record,
    }


def write(manifest):
    REPORTS_DIR.mkdir(exist_ok=True)
    with OUT_FILE.open("w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def check(manifest):
    if not OUT_FILE.exists():
        print(f"FAIL {OUT_FILE.relative_to(ROOT)} missing. Run without --check.")
        return 1
    committed = json.loads(OUT_FILE.read_text(encoding="utf-8"))
    for key in ("vocabulary_version", "rules_version"):
        if committed.get(key) != manifest[key]:
            print(
                f"FAIL {key} changed ({committed.get(key)} -> {manifest[key]}). "
                "All labels must be regenerated; this is not a content change."
            )
            return 1
    if committed.get("config_hash") != manifest["config_hash"]:
        print(
            "FAIL vocabulary or rules were edited without a version bump "
            f"(config_hash {str(committed.get('config_hash'))[:12]} -> "
            f"{manifest['config_hash'][:12]}). Bump rules_version and regenerate."
        )
        return 1
    old, new = committed.get("per_record", {}), manifest["per_record"]
    changed = [k for k in set(old) & set(new) if old[k] != new[k]]
    added, removed = sorted(set(new) - set(old)), sorted(set(old) - set(new))
    if not (changed or added or removed):
        print(f"OK {manifest['total_records']} records, capabilities unchanged.")
        return 0
    print("FAIL reports/capabilities.json is stale. Regenerate and commit it.")
    for label, ids in (("changed", changed), ("added", added), ("removed", removed)):
        if ids:
            shown = ", ".join(sorted(ids)[:10])
            print(f"  {label} ({len(ids)}): {shown}{' …' if len(ids) > 10 else ''}")
    return 1


def sample(manifest, n, seed):
    """Stratified sample for manual precision/recall review."""
    recs = {r["id"]: r for r in load_records()}
    by_cat = defaultdict(list)
    for rid in manifest["per_record"]:
        by_cat[recs[rid]["category"]].append(rid)
    rng = random.Random(seed)
    per_cat = max(1, n // len(by_cat))
    picked = []
    for cat in sorted(by_cat):
        picked.extend(rng.sample(sorted(by_cat[cat]), min(per_cat, len(by_cat[cat]))))
    out = []
    for rid in picked[:n]:
        r, cap = recs[rid], manifest["per_record"][rid]
        out.append({
            "id": rid,
            "category": r["category"],
            "subcategory": r["subcategory"],
            "title": r["title"],
            "assigned_high": cap["high"],
            "assigned_medium": cap["medium"],
            "uncertain": cap["uncertain"],
            "acceptance_criteria": r.get("acceptance_criteria", []),
            "prompt": r["prompt"],
            "negative_prompt": r.get("negative_prompt", ""),
        })
    return {"seed": seed, "requested": n, "returned": len(out), "records": out}


def main():
    ap = argparse.ArgumentParser(description="Derive capabilities from deterministic rules")
    ap.add_argument("--check", action="store_true", help="fail if committed manifest is stale")
    ap.add_argument("--sample", type=int, metavar="N", help="emit N records for manual review")
    ap.add_argument("--seed", type=int, default=7, help="sample seed (default 7)")
    args = ap.parse_args()

    manifest = build()

    if args.sample:
        json.dump(sample(manifest, args.sample, args.seed), sys.stdout,
                  indent=2, ensure_ascii=False)
        print()
        return 0

    if args.check:
        return check(manifest)

    write(manifest)
    print(f"✓ {manifest['total_records']} records -> {OUT_FILE.relative_to(ROOT)}")
    print(f"  vocabulary={manifest['vocabulary_version']} rules={manifest['rules_version']}")
    print(f"  coverage={manifest['coverage_pct']}% "
          f"({manifest['records_without_capability_count']} without any capability)")
    print(f"  capabilities/record: mean={manifest['capabilities_per_record']['mean']} "
          f"min={manifest['capabilities_per_record']['min']} "
          f"max={manifest['capabilities_per_record']['max']}")
    if manifest["unused_capabilities"]:
        print(f"  UNUSED capabilities (no record matched): {manifest['unused_capabilities']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
