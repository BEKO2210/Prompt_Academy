#!/usr/bin/env python3
"""
Prompt Dataset Deduplication Analyzer
Detects exact duplicates, similar titles, repeated opening phrases,
and overused patterns across the prompt dataset.
"""

import json
import hashlib
import re
from pathlib import Path
from collections import Counter, defaultdict

DATA_DIR = Path(__file__).parent.parent / "data"
REPORTS_DIR = Path(__file__).parent.parent / "reports"

# Common English stopwords
STOPWORDS = {
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'dare', 'ought', 'used', 'this', 'that', 'these', 'those', 'i', 'me',
    'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
    'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'when',
    'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'also', 'get', 'use',
    'using', 'use', 'build', 'create', 'design', 'make', 'implement',
    'generate', 'produce', 'develop', 'render', 'construct', 'deliver'
}


def normalize_for_fingerprint(text):
    """Create a normalized fingerprint for deduplication."""
    text = text.lower()
    # Remove punctuation
    text = re.sub(r'[^\w\s]', ' ', text)
    # Remove numbers
    text = re.sub(r'\d+', ' ', text)
    # Split to words
    words = text.split()
    # Remove stopwords
    words = [w for w in words if w not in STOPWORDS and len(w) > 2]
    # Sort for consistency
    words = sorted(words)
    return ' '.join(words)


def compute_hash(fingerprint):
    """Compute SHA-256 hash of fingerprint."""
    return hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()


def similarity_score(text1, text2):
    """Compute a simple word overlap similarity score."""
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    if not words1 or not words2:
        return 0.0
    intersection = words1 & words2
    union = words1 | words2
    return len(intersection) / len(union)


def main():
    print("=" * 60)
    print("DUPLICATE DETECTION ANALYZER")
    print("=" * 60)

    if not DATA_DIR.exists():
        print(f"ERROR: Data directory not found: {DATA_DIR}")
        return 1

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    fingerprints = {}
    titles = {}
    slugs = {}
    first_sentences = {}
    first5words = Counter()
    all_prompts = []

    jsonl_files = sorted(DATA_DIR.glob("*.jsonl"))

    for filepath in jsonl_files:
        filename = filepath.name
        print(f"\n  Processing: {filename}")

        with open(filepath, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith("```"):
                    continue

                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                prompt_text = obj.get("prompt", "")
                title = obj.get("title", "")
                slug = obj.get("slug", "")
                prompt_id = obj.get("id", f"unknown_{line_num}")
                category = obj.get("category", "unknown")

                all_prompts.append({
                    "id": prompt_id,
                    "title": title,
                    "slug": slug,
                    "category": category,
                    "prompt": prompt_text,
                    "source_file": filename,
                    "line_num": line_num
                })

                # Fingerprint
                fp = normalize_for_fingerprint(prompt_text)
                fp_hash = compute_hash(fp)

                if fp_hash in fingerprints:
                    fingerprints[fp_hash]["count"] += 1
                    fingerprints[fp_hash]["ids"].append(prompt_id)
                else:
                    fingerprints[fp_hash] = {
                        "count": 1,
                        "ids": [prompt_id],
                        "fingerprint": fp[:100]
                    }

                # Title
                if title in titles:
                    titles[title].append(prompt_id)
                else:
                    titles[title] = [prompt_id]

                # Slug
                if slug in slugs:
                    slugs[slug].append(prompt_id)
                else:
                    slugs[slug] = [prompt_id]

                # First sentence
                first_sentence = prompt_text.split('.')[0] if '.' in prompt_text else prompt_text[:100]
                if first_sentence in first_sentences:
                    first_sentences[first_sentence].append(prompt_id)
                else:
                    first_sentences[first_sentence] = [prompt_id]

                # First 5 words
                words = prompt_text.split()[:5]
                first5 = ' '.join(words).lower()
                first5words[first5] += 1

    print(f"\n  Total prompts analyzed: {len(all_prompts)}")

    # Find exact fingerprint duplicates
    exact_dups = {k: v for k, v in fingerprints.items() if v["count"] > 1}

    # Find duplicate titles
    title_dups = {k: v for k, v in titles.items() if len(v) > 1}

    # Find duplicate slugs
    slug_dups = {k: v for k, v in slugs.items() if len(v) > 1}

    # Find duplicate first sentences
    sentence_dups = {k: v for k, v in first_sentences.items() if len(v) > 1}

    # Find overused first-5-word patterns (>5 occurrences)
    f5_overused = {k: v for k, v in first5words.items() if v > 5}

    # Find similar prompts (>70% similarity)
    similar_pairs = []
    print("\n  Checking for semantic similarity (this may take a moment)...")

    # Only check within same category for efficiency
    by_category = defaultdict(list)
    for p in all_prompts:
        by_category[p["category"]].append(p)

    for cat, prompts in by_category.items():
        cat_list = prompts
        checked = set()
        for i in range(len(cat_list)):
            for j in range(i + 1, min(i + 50, len(cat_list))):  # Check next 50 only
                pair_key = tuple(sorted([cat_list[i]["id"], cat_list[j]["id"]]))
                if pair_key in checked:
                    continue
                checked.add(pair_key)
                sim = similarity_score(cat_list[i]["prompt"], cat_list[j]["prompt"])
                if sim > 0.70:
                    similar_pairs.append({
                        "id1": cat_list[i]["id"],
                        "id2": cat_list[j]["id"],
                        "similarity": round(sim, 3),
                        "category": cat
                    })

    # Report
    print("\n" + "=" * 60)
    print("DUPLICATE DETECTION RESULTS")
    print("=" * 60)
    print(f"\nExact fingerprint duplicates:  {len(exact_dups)}")
    print(f"Duplicate titles:               {len(title_dups)}")
    print(f"Duplicate slugs:                {len(slug_dups)}")
    print(f"Duplicate first sentences:      {len(sentence_dups)}")
    print(f"Overused first-5-word patterns: {len(f5_overused)}")
    print(f"High similarity pairs (>70%):   {len(similar_pairs)}")

    if exact_dups:
        print("\n--- Exact Fingerprint Duplicates ---")
        for h, info in list(exact_dups.items())[:10]:
            print(f"  Hash: {h[:16]}... | Count: {info['count']} | IDs: {', '.join(info['ids'][:5])}")

    if title_dups:
        print("\n--- Duplicate Titles (top 10) ---")
        for title, ids in sorted(title_dups.items(), key=lambda x: -len(x[1]))[:10]:
            print(f"  '{title[:60]}' appears {len(ids)} times")

    if f5_overused:
        print("\n--- Overused First-5-Word Patterns (top 10) ---")
        for pattern, count in sorted(f5_overused.items(), key=lambda x: -x[1])[:10]:
            print(f"  '{pattern}' used {count} times")

    # Write report
    report = {
        "timestamp": "2026-05-29T00:00:00Z",
        "total_prompts_analyzed": len(all_prompts),
        "exact_fingerprint_duplicates": {
            "count": len(exact_dups),
            "details": [
                {"hash": h[:16], "count": v["count"], "ids": v["ids"]}
                for h, v in list(exact_dups.items())
            ]
        },
        "duplicate_titles": {
            "count": len(title_dups),
            "details": [
                {"title": k[:80], "ids": v, "occurrences": len(v)}
                for k, v in list(title_dups.items())[:50]
            ]
        },
        "duplicate_slugs": {
            "count": len(slug_dups),
            "details": [
                {"slug": k, "ids": v, "occurrences": len(v)}
                for k, v in list(slug_dups.items())[:50]
            ]
        },
        "duplicate_first_sentences": {
            "count": len(sentence_dups),
            "details": [
                {"sentence": k[:100], "ids": v[:10], "occurrences": len(v)}
                for k, v in list(sentence_dups.items())[:50]
            ]
        },
        "overused_first5_patterns": {
            "count": len(f5_overused),
            "details": [
                {"pattern": k, "count": v}
                for k, v in sorted(f5_overused.items(), key=lambda x: -x[1])[:50]
            ]
        },
        "high_similarity_pairs": {
            "count": len(similar_pairs),
            "pairs": similar_pairs[:100]
        },
        "overall_status": "CLEAN" if not any([
            exact_dups, title_dups, slug_dups, sentence_dups, f5_overused, similar_pairs
        ]) else "NEEDS_REVIEW"
    }

    report_path = REPORTS_DIR / "duplicate_report.json"
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nDuplicate report written to: {report_path}")

    status = "PASS" if not any([exact_dups, title_dups, slug_dups]) else "NEEDS_REVIEW"
    print(f"\nOverall duplicate check: {status}")
    return 0


if __name__ == "__main__":
    exit(main())
