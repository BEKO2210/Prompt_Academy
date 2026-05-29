#!/usr/bin/env python3
"""
Prompt Dataset Validator
Validates all JSONL files in the dataset for schema compliance,
uniqueness constraints, and quality requirements.
"""

import json
import os
import sys
from pathlib import Path
from collections import Counter, defaultdict

# Configuration
DATA_DIR = Path(__file__).parent.parent / "data"
REPORTS_DIR = Path(__file__).parent.parent / "reports"
SCHEMA_FILE = Path(__file__).parent.parent / "schema" / "prompt.schema.json"

REQUIRED_FIELDS = [
    "id", "version", "category", "subcategory", "title", "slug",
    "language", "difficulty", "audience", "use_case", "industry",
    "style", "tech_stack", "prompt", "negative_prompt",
    "acceptance_criteria", "tags", "website_card", "quality",
    "created_by_agent", "batch"
]

VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced", "expert"]
VALID_LANGUAGES = ["en", "de"]
VALID_AUDIENCES = [
    "frontend_developer", "fullstack_developer", "designer",
    "product_designer", "founder", "marketer", "teacher",
    "content_creator", "ai_builder", "game_developer"
]
VALID_USE_CASES = [
    "website_generation", "component_generation", "app_generation",
    "dashboard_generation", "design_system_generation",
    "animation_generation", "copywriting_plus_ui", "educational_interface",
    "game_ui_generation", "data_visualization"
]
VALID_CATEGORIES = [
    "landing_pages", "ui_components", "saas_dashboards", "ecommerce",
    "portfolio_personal_brand", "ai_tools_agents", "education_learning",
    "mobile_apps", "games_interactive", "data_visualization"
]

STYLE_FIELDS = ["visual_style", "layout_style", "color_direction", "motion_style"]
TECH_STACK_FIELDS = ["framework", "language", "styling"]
QUALITY_FIELDS = ["specificity_score", "originality_score",
                  "implementation_clarity_score", "website_readiness_score"]
WEBSITE_CARD_FIELDS = ["headline", "summary", "preview_label", "search_keywords"]


def load_schema():
    """Load JSON schema if available."""
    if SCHEMA_FILE.exists():
        with open(SCHEMA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def validate_prompt(prompt_obj, line_num, filename):
    """Validate a single prompt object. Returns list of errors."""
    errors = []

    # Check required fields
    for field in REQUIRED_FIELDS:
        if field not in prompt_obj:
            errors.append(f"[{filename}:{line_num}] Missing required field: '{field}'")

    if errors:
        return errors

    # Validate id format
    prompt_id = prompt_obj.get("id", "")
    if not prompt_id.startswith("PRM-") or len(prompt_id) != 10:
        errors.append(f"[{filename}:{line_num}] Invalid ID format: '{prompt_id}'")

    # Validate category
    category = prompt_obj.get("category", "")
    if category not in VALID_CATEGORIES:
        errors.append(f"[{filename}:{line_num}] Invalid category: '{category}'")

    # Validate difficulty
    difficulty = prompt_obj.get("difficulty", "")
    if difficulty not in VALID_DIFFICULTIES:
        errors.append(f"[{filename}:{line_num}] Invalid difficulty: '{difficulty}'")

    # Validate language
    language = prompt_obj.get("language", "")
    if language not in VALID_LANGUAGES:
        errors.append(f"[{filename}:{line_num}] Invalid language: '{language}'")

    # Validate audience
    audience = prompt_obj.get("audience", "")
    if audience not in VALID_AUDIENCES:
        errors.append(f"[{filename}:{line_num}] Invalid audience: '{audience}'")

    # Validate use_case
    use_case = prompt_obj.get("use_case", "")
    if use_case not in VALID_USE_CASES:
        errors.append(f"[{filename}:{line_num}] Invalid use_case: '{use_case}'")

    # Validate style fields
    style = prompt_obj.get("style", {})
    for sf in STYLE_FIELDS:
        if sf not in style:
            errors.append(f"[{filename}:{line_num}] Missing style field: '{sf}'")

    # Validate tech_stack fields
    tech = prompt_obj.get("tech_stack", {})
    for tf in TECH_STACK_FIELDS:
        if tf not in tech:
            errors.append(f"[{filename}:{line_num}] Missing tech_stack field: '{tf}'")

    # Validate quality scores
    quality = prompt_obj.get("quality", {})
    for qf in QUALITY_FIELDS:
        if qf not in quality:
            errors.append(f"[{filename}:{line_num}] Missing quality field: '{qf}'")
        else:
            score = quality[qf]
            if not isinstance(score, int) or score < 1 or score > 10:
                errors.append(f"[{filename}:{line_num}] Invalid quality score for '{qf}': {score}")

    # Validate website_card fields
    wc = prompt_obj.get("website_card", {})
    for wf in WEBSITE_CARD_FIELDS:
        if wf not in wc:
            errors.append(f"[{filename}:{line_num}] Missing website_card field: '{wf}'")

    # Validate prompt length (80-220 words)
    prompt_text = prompt_obj.get("prompt", "")
    word_count = len(prompt_text.split())
    if word_count < 80:
        errors.append(f"[{filename}:{line_num}] Prompt too short: {word_count} words (min 80)")
    if word_count > 220:
        errors.append(f"[{filename}:{line_num}] Prompt too long: {word_count} words (max 220)")

    # Validate negative_prompt length (max 60 words)
    neg_prompt = prompt_obj.get("negative_prompt", "")
    neg_word_count = len(neg_prompt.split())
    if neg_word_count > 60:
        errors.append(f"[{filename}:{line_num}] Negative prompt too long: {neg_word_count} words (max 60)")

    # Validate acceptance_criteria (3-6 items)
    ac = prompt_obj.get("acceptance_criteria", [])
    if len(ac) < 3:
        errors.append(f"[{filename}:{line_num}] Too few acceptance criteria: {len(ac)} (min 3)")
    if len(ac) > 6:
        errors.append(f"[{filename}:{line_num}] Too many acceptance criteria: {len(ac)} (max 6)")

    # Validate tags (5-12 items, lowercase kebab-case)
    tags = prompt_obj.get("tags", [])
    if len(tags) < 5:
        errors.append(f"[{filename}:{line_num}] Too few tags: {len(tags)} (min 5)")
    if len(tags) > 12:
        errors.append(f"[{filename}:{line_num}] Too many tags: {len(tags)} (max 12)")

    return errors


def main():
    print("=" * 60)
    print("PROMPT DATASET VALIDATOR")
    print("=" * 60)

    if not DATA_DIR.exists():
        print(f"ERROR: Data directory not found: {DATA_DIR}")
        sys.exit(1)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    all_errors = []
    all_prompts = []
    category_counts = Counter()
    difficulty_counts = Counter()
    language_counts = Counter()
    ids_seen = {}
    slugs_seen = {}
    titles_seen = {}
    first_words_counter = Counter()

    jsonl_files = sorted(DATA_DIR.glob("*.jsonl"))

    if not jsonl_files:
        print("ERROR: No .jsonl files found in data/ directory")
        sys.exit(1)

    print(f"\nFound {len(jsonl_files)} JSONL files to validate:\n")

    for filepath in jsonl_files:
        filename = filepath.name
        print(f"  Validating: {filename}")

        line_count = 0
        valid_lines = 0
        invalid_lines = 0
        file_category = None

        with open(filepath, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue

                line_count += 1

                # Check for markdown code blocks
                if line.startswith("```"):
                    all_errors.append(f"[{filename}:{line_num}] Markdown code block detected")
                    invalid_lines += 1
                    continue

                # Try to parse JSON
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError as e:
                    all_errors.append(f"[{filename}:{line_num}] JSON parse error: {e}")
                    invalid_lines += 1
                    continue

                # Validate schema
                errors = validate_prompt(obj, line_num, filename)
                if errors:
                    all_errors.extend(errors)
                    invalid_lines += 1
                else:
                    valid_lines += 1
                    all_prompts.append(obj)

                    # Track category
                    cat = obj.get("category", "unknown")
                    category_counts[cat] += 1
                    file_category = cat

                    # Track difficulty
                    diff = obj.get("difficulty", "unknown")
                    difficulty_counts[diff] += 1

                    # Track language
                    lang = obj.get("language", "unknown")
                    language_counts[lang] += 1

                    # Track IDs
                    prompt_id = obj.get("id", "")
                    if prompt_id in ids_seen:
                        all_errors.append(
                            f"[{filename}:{line_num}] Duplicate ID: '{prompt_id}' "
                            f"(first seen in {ids_seen[prompt_id]})"
                        )
                    else:
                        ids_seen[prompt_id] = f"{filename}:{line_num}"

                    # Track slugs
                    slug = obj.get("slug", "")
                    if slug in slugs_seen:
                        all_errors.append(
                            f"[{filename}:{line_num}] Duplicate slug: '{slug}' "
                            f"(first seen in {slugs_seen[slug]})"
                        )
                    else:
                        slugs_seen[slug] = f"{filename}:{line_num}"

                    # Track titles
                    title = obj.get("title", "")
                    if title in titles_seen:
                        all_errors.append(
                            f"[{filename}:{line_num}] Duplicate title: '{title[:50]}' "
                            f"(first seen in {titles_seen[title]})"
                        )
                    else:
                        titles_seen[title] = f"{filename}:{line_num}"

                    # Track first 5 words
                    prompt_text = obj.get("prompt", "")
                    first5 = " ".join(prompt_text.split()[:5]).lower()
                    first_words_counter[first5] += 1

        print(f"    Lines: {line_count} | Valid: {valid_lines} | Invalid: {invalid_lines}")

    # Check first-5-words duplicates
    f5_duplicates = {k: v for k, v in first_words_counter.items() if v > 5}

    # Summary
    total_prompts = len(all_prompts)
    total_categories = len(category_counts)
    duplicate_ids = len(all_prompts) - len(ids_seen)
    duplicate_slugs = len(all_prompts) - len(slugs_seen)
    duplicate_titles = len(all_prompts) - len(titles_seen)

    print("\n" + "=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    print(f"\nTotal prompts:       {total_prompts}")
    print(f"Total categories:    {total_categories}")
    print(f"Invalid lines:       {len([e for e in all_errors if 'JSON parse error' in e or 'Markdown' in e])}")
    print(f"Schema errors:       {len([e for e in all_errors if 'Missing' in e or 'Invalid' in e or 'Too' in e])}")
    print(f"Duplicate IDs:       {duplicate_ids}")
    print(f"Duplicate slugs:     {duplicate_slugs}")
    print(f"Duplicate titles:    {duplicate_titles}")
    print(f"First-5-word dups:   {len(f5_duplicates)}")
    print(f"Total errors:        {len(all_errors)}")

    # Per-category stats
    print("\n--- Category Breakdown ---")
    for cat, count in sorted(category_counts.items()):
        status = "PASS" if count >= 1000 else "FAIL"
        print(f"  {cat}: {count} [{status}]")

    # Difficulty distribution
    print("\n--- Difficulty Distribution ---")
    for diff, count in sorted(difficulty_counts.items()):
        pct = (count / total_prompts * 100) if total_prompts > 0 else 0
        print(f"  {diff}: {count} ({pct:.1f}%)")

    # Language distribution
    print("\n--- Language Distribution ---")
    for lang, count in sorted(language_counts.items()):
        pct = (count / total_prompts * 100) if total_prompts > 0 else 0
        print(f"  {lang}: {count} ({pct:.1f}%)")

    # Pass/Fail
    min_total = 10000
    min_per_category = 1000
    passed = (
        total_prompts >= min_total and
        total_categories >= 10 and
        duplicate_ids == 0 and
        duplicate_slugs == 0 and
        len(f5_duplicates) == 0 and
        all(count >= min_per_category for count in category_counts.values())
    )

    status = "PASS" if passed else "FAIL"
    print(f"\n{'=' * 60}")
    print(f"OVERALL RESULT: {status}")
    print(f"{'=' * 60}")

    # Write validation report
    report = {
        "timestamp": "2026-05-29T00:00:00Z",
        "total_prompts": total_prompts,
        "total_categories": total_categories,
        "invalid_lines": invalid_lines,
        "total_errors": len(all_errors),
        "duplicate_ids": duplicate_ids,
        "duplicate_slugs": duplicate_slugs,
        "duplicate_titles": duplicate_titles,
        "first5_duplicates": len(f5_duplicates),
        "category_counts": dict(category_counts),
        "difficulty_distribution": dict(difficulty_counts),
        "language_distribution": dict(language_counts),
        "errors": all_errors[:500],  # Limit report size
        "overall_result": status
    }

    report_path = REPORTS_DIR / "validation_errors.json"
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nValidation report written to: {report_path}")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
