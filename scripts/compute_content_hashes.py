#!/usr/bin/env python3
"""
Per-record content_hash computation (ENG-004, ADR-0007 stage 1).

Answers "did this record change, and how?" without a full diff. Enables
idempotent import, correct cache keying, and benchmark traceability -- a
benchmark result is uninterpretable if the record it tested has since changed
silently.

Writes reports/content_hashes.json. Deliberately NOT written into
site/public/data/, because everything there is shipped to the browser and
index.json is already 6,908,069 bytes (finding D1). None of the hash's
consumers -- change detection, import idempotency, cache keys, benchmark
provenance -- run in the browser.

Also NOT written into data/*.jsonl: the hash is derived, so storing it beside
its own inputs invites the classic bug where the stored hash is stale relative
to the content it describes, and it would add ~7x10^4 bytes of churn to every
dataset diff.

Usage:
    python3 scripts/compute_content_hashes.py
    python3 scripts/compute_content_hashes.py --check      # CI: fail if stale
    python3 scripts/compute_content_hashes.py --self-test  # verify the hash itself
"""

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
OUT_FILE = REPORTS_DIR / "content_hashes.json"

# Bump when NORMALIZATION or HASHED_FIELDS change. Every consumer must treat a
# different algo_version as "all hashes changed", not as "content changed".
ALGO_VERSION = "1.0.0"

# Content-bearing fields only. Deliberately excluded and why:
#   id, slug           identity, not content -- a rename is not a content change
#   version            would make the hash circular once versioning uses it
#   created_by_agent   provenance of generation, not content
#   batch              generation bookkeeping
#   quality.*          self-reported scores, not independently validated
#                      (finding D6); excluded so a rescore is not a content change
#   website_card.*     presentation, derived from the content fields
#   tags               presentation/search metadata rather than instruction content
HASHED_FIELDS = [
    "category",
    "subcategory",
    "title",
    "language",
    "difficulty",
    "audience",
    "use_case",
    "industry",
    "style",
    "tech_stack",
    "prompt",
    "negative_prompt",
    "acceptance_criteria",
]


def normalize(value):
    """
    Canonicalize a value so semantically identical content hashes identically.

    Rules (documented because the hash is only reproducible if they are fixed):
      - dict:  recurse, keys sorted -- JSON key order must not affect the hash
      - list:  recurse, order PRESERVED -- acceptance_criteria order is meaningful
      - str:   strip outer whitespace, collapse internal whitespace runs to one
               space, normalize CRLF/CR to LF first
      - other: passed through unchanged (numbers, bool, None)
    """
    if isinstance(value, dict):
        return {k: normalize(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, str):
        return " ".join(value.replace("\r\n", "\n").replace("\r", "\n").split())
    return value


def content_hash(record):
    """sha256 over the canonical JSON of the normalized content-bearing fields."""
    projection = {}
    for field in HASHED_FIELDS:
        if field in record:
            projection[field] = normalize(record[field])
    canonical = json.dumps(
        projection,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def load_records():
    """Yield (source_file, record) for every record, in stable file order."""
    files = sorted(DATA_DIR.glob("*.jsonl"))
    if not files:
        sys.exit(f"No .jsonl files found in {DATA_DIR}")
    for path in files:
        with open(path, "r", encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    yield path.name, json.loads(line)
                except json.JSONDecodeError as exc:
                    sys.exit(f"{path.name}:{lineno}: invalid JSON: {exc}")


def build():
    hashes = {}
    per_file = Counter()
    missing_fields = Counter()

    for filename, record in load_records():
        rid = record.get("id")
        if not rid:
            sys.exit(f"{filename}: record without an id")
        if rid in hashes:
            sys.exit(f"duplicate id {rid} (already seen in {hashes[rid]['file']})")
        for field in HASHED_FIELDS:
            if field not in record:
                missing_fields[field] += 1
        hashes[rid] = {"file": filename, "hash": content_hash(record)}
        per_file[filename] += 1

    distinct = len({v["hash"] for v in hashes.values()})
    collisions = len(hashes) - distinct

    return {
        "algo_version": ALGO_VERSION,
        "hash": "sha256",
        "hashed_fields": HASHED_FIELDS,
        "normalization": {
            "dict_keys": "sorted",
            "list_order": "preserved",
            "strings": "CRLF/CR -> LF, outer whitespace stripped, internal whitespace runs collapsed to one space",
            "json": "sort_keys=True, ensure_ascii=False, separators=(',',':')",
        },
        "total_records": len(hashes),
        "records_per_file": dict(sorted(per_file.items())),
        "distinct_hashes": distinct,
        "identical_content_groups": collisions,
        "identical_content_note": (
            "Records whose hashed content is byte-identical after normalization. "
            "Non-zero is a real duplicate-content signal, not a hash defect -- "
            "ids, slugs and titles are excluded from the hash by design."
        ),
        "fields_missing_from_some_records": dict(missing_fields) or None,
        "hashes": {rid: hashes[rid]["hash"] for rid in sorted(hashes)},
    }


def write(manifest):
    REPORTS_DIR.mkdir(exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def check(manifest):
    """CI mode: non-zero exit if the committed manifest is stale."""
    if not OUT_FILE.exists():
        print(f"FAIL {OUT_FILE.relative_to(ROOT)} missing. Run without --check.")
        return 1
    with open(OUT_FILE, "r", encoding="utf-8") as fh:
        committed = json.load(fh)

    if committed.get("algo_version") != manifest["algo_version"]:
        print(
            f"FAIL algo_version changed "
            f"({committed.get('algo_version')} -> {manifest['algo_version']}). "
            "All hashes must be regenerated; this is not a content change."
        )
        return 1

    old, new = committed.get("hashes", {}), manifest["hashes"]
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    changed = sorted(k for k in set(old) & set(new) if old[k] != new[k])

    if not (added or removed or changed):
        print(f"OK {manifest['total_records']} records, hashes unchanged.")
        return 0

    print("FAIL content_hashes.json is stale. Regenerate and commit it.")
    for label, ids in (("changed", changed), ("added", added), ("removed", removed)):
        if ids:
            shown = ", ".join(ids[:10]) + (f" ... (+{len(ids) - 10})" if len(ids) > 10 else "")
            print(f"  {label} ({len(ids)}): {shown}")
    return 1


def self_test():
    """
    Verify the hash function's own properties. Runs without a test framework,
    which does not exist in this repo yet (finding D4 / ENG-003). ENG-003 wires
    this into CI rather than reimplementing it.
    """
    base = {
        "id": "PRM-000001",
        "category": "landing_pages",
        "subcategory": "hero_section",
        "title": "Example",
        "language": "en",
        "difficulty": "advanced",
        "audience": "frontend_developer",
        "use_case": "website_generation",
        "industry": "saas",
        "style": {"visual_style": "glass", "layout_style": "grid",
                  "color_direction": "cool", "motion_style": "subtle"},
        "tech_stack": {"framework": "React", "language": "TypeScript", "styling": "Tailwind"},
        "prompt": "Build a hero section.",
        "negative_prompt": "No lorem ipsum.",
        "acceptance_criteria": ["responsive", "keyboard navigable"],
        "quality": {"specificity_score": 8},
        "version": "1.0.0",
    }
    h = content_hash(base)
    cases = []

    def case(name, ok):
        cases.append((name, ok))

    # determinism
    case("deterministic across calls", content_hash(base) == h)

    # key order must not matter
    shuffled = dict(reversed(list(base.items())))
    case("JSON key order does not affect hash", content_hash(shuffled) == h)

    # whitespace normalization
    ws = {**base, "prompt": "  Build   a\r\nhero    section.  "}
    case("whitespace/CRLF normalized", content_hash(ws) == h)

    # content sensitivity
    for field, mutated in [
        ("prompt", "Build a hero section!"),
        ("negative_prompt", "No lorem ipsum at all."),
        ("title", "Example "),          # only differs by whitespace -> should NOT change
    ]:
        changed = content_hash({**base, field: mutated}) != h
        if field == "title":
            case("trailing-whitespace-only title change does NOT alter hash", not changed)
        else:
            case(f"{field} change alters hash", changed)

    case("acceptance_criteria content change alters hash",
         content_hash({**base, "acceptance_criteria": ["responsive", "keyboard nav"]}) != h)

    # list order IS meaningful
    case("acceptance_criteria order alters hash",
         content_hash({**base, "acceptance_criteria": ["keyboard navigable", "responsive"]}) != h)

    # nested change is caught
    case("nested tech_stack change alters hash",
         content_hash({**base, "tech_stack": {**base["tech_stack"], "framework": "Vue"}}) != h)

    # excluded fields must NOT affect the hash
    for field, mutated in [
        ("id", "PRM-999999"),
        ("version", "2.0.0"),
        ("quality", {"specificity_score": 1}),
        ("created_by_agent", "someone_else"),
        ("batch", "batch-2"),
        ("tags", ["a", "b"]),
    ]:
        case(f"{field} does NOT affect hash",
             content_hash({**base, field: mutated}) == h)

    # missing optional field is tolerated, and changes the hash (fewer inputs)
    without = {k: v for k, v in base.items() if k != "negative_prompt"}
    case("missing hashed field is tolerated", isinstance(content_hash(without), str))

    failures = [n for n, ok in cases if not ok]
    for name, ok in cases:
        print(f"  {'ok  ' if ok else 'FAIL'} {name}")
    print(f"\n{len(cases) - len(failures)}/{len(cases)} passed")
    return 1 if failures else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--check", action="store_true",
                    help="fail if the committed manifest is stale (CI mode)")
    ap.add_argument("--self-test", action="store_true",
                    help="verify the hash function's properties, no dataset needed")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    manifest = build()

    if args.check:
        return check(manifest)

    write(manifest)
    print(f"✓ {manifest['total_records']} records hashed -> "
          f"{OUT_FILE.relative_to(ROOT)}")
    print(f"  algo_version={manifest['algo_version']} "
          f"distinct={manifest['distinct_hashes']} "
          f"identical_content_groups={manifest['identical_content_groups']}")
    if manifest["fields_missing_from_some_records"]:
        print(f"  note: fields absent from some records: "
              f"{manifest['fields_missing_from_some_records']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
