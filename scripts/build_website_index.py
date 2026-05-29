#!/usr/bin/env python3
"""
Website Index Builder
Generates website_index.json from all JSONL prompt files.
Creates a flattened index optimized for quick web display and search.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR = Path(__file__).parent.parent


def main():
    print("=" * 60)
    print("WEBSITE INDEX BUILDER")
    print("=" * 60)

    if not DATA_DIR.exists():
        print(f"ERROR: Data directory not found: {DATA_DIR}")
        return 1

    items = []
    jsonl_files = sorted(DATA_DIR.glob("*.jsonl"))

    print(f"\nProcessing {len(jsonl_files)} JSONL files...\n")

    for filepath in jsonl_files:
        filename = filepath.name
        count = 0

        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("```"):
                    continue

                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                website_card = obj.get("website_card", {})

                item = {
                    "id": obj.get("id", ""),
                    "title": obj.get("title", ""),
                    "slug": obj.get("slug", ""),
                    "category": obj.get("category", ""),
                    "subcategory": obj.get("subcategory", ""),
                    "difficulty": obj.get("difficulty", ""),
                    "headline": website_card.get("headline", ""),
                    "summary": website_card.get("summary", ""),
                    "tags": obj.get("tags", []),
                    "search_keywords": website_card.get("search_keywords", [])
                }

                items.append(item)
                count += 1

        print(f"  {filename}: {count} items")

    # Build index
    index = {
        "meta": {
            "version": "1.0.0",
            "total_items": len(items),
            "generated_at": "2026-05-29T00:00:00Z",
            "source_files": len(jsonl_files)
        },
        "items": items
    }

    # Write output
    output_path = OUTPUT_DIR / "website_index.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"\n{'=' * 60}")
    print(f"Website index created: {output_path}")
    print(f"Total indexed items: {len(items)}")
    print(f"{'=' * 60}")

    return 0


if __name__ == "__main__":
    exit(main())
