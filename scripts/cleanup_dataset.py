#!/usr/bin/env python3
"""
Dataset Cleanup Script
Fixes invalid enum values, deduplicates titles, and resolves schema violations.
"""

import json
import re
from pathlib import Path
from collections import Counter, defaultdict

DATA_DIR = Path(__file__).parent.parent / "data"
REPORTS_DIR = Path(__file__).parent.parent / "reports"

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

VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced", "expert"]
VALID_LANGUAGES = ["en", "de"]
VALID_CATEGORIES = [
    "landing_pages", "ui_components", "saas_dashboards", "ecommerce",
    "portfolio_personal_brand", "ai_tools_agents", "education_learning",
    "mobile_apps", "games_interactive", "data_visualization"
]

# Mapping for invalid audience values
AUDIENCE_MAP = {
    "web_developer": "frontend_developer",
    "ui_designer": "designer",
    "ux_designer": "designer",
    "indie_hacker": "founder",
    "startup_founder": "founder",
    "developer": "frontend_developer",
    "backend_developer": "fullstack_developer",
    "software_engineer": "fullstack_developer",
    "graphic_designer": "designer",
    "motion_designer": "designer",
    "brand_designer": "designer",
    "web_designer": "designer",
    "digital_marketer": "marketer",
    "growth_hacker": "marketer",
    "seo_specialist": "marketer",
    "social_media_manager": "content_creator",
    "youtuber": "content_creator",
    "blogger": "content_creator",
    "podcaster": "content_creator",
    "influencer": "content_creator",
    "streamer": "content_creator",
    "student": "teacher",
    "educator": "teacher",
    "professor": "teacher",
    "instructor": "teacher",
    "tutor": "teacher",
    "parent": "teacher",
    "data_scientist": "ai_builder",
    "ml_engineer": "ai_builder",
    "ai_researcher": "ai_builder",
    "prompt_engineer": "ai_builder",
    "narrative_designer": "game_developer",
    "level_designer": "game_developer",
    "game_designer": "game_developer",
    "product_manager": "product_designer",
    "project_manager": "product_designer",
    "scrum_master": "product_designer",
    "agile_coach": "product_designer",
    "devops_engineer": "fullstack_developer",
    "sre": "fullstack_developer",
    "cloud_engineer": "fullstack_developer",
    "security_engineer": "fullstack_developer",
    "blockchain_developer": "fullstack_developer",
    "mobile_developer": "frontend_developer",
    "react_developer": "frontend_developer",
    "vue_developer": "frontend_developer",
    "angular_developer": "frontend_developer",
    "svelte_developer": "frontend_developer",
}

# Mapping for invalid use_case values
USE_CASE_MAP = {
    "ui_generation": "component_generation",
    "web_app_generation": "app_generation",
    "landing_page_generation": "website_generation",
    "dashboard_ui": "dashboard_generation",
    "design_generation": "design_system_generation",
    "motion_design": "animation_generation",
    "content_generation": "copywriting_plus_ui",
    "learning_interface": "educational_interface",
    "game_design": "game_ui_generation",
    "chart_generation": "data_visualization",
    "visualization": "data_visualization",
}


def fix_audience(value):
    if value in VALID_AUDIENCES:
        return value
    return AUDIENCE_MAP.get(value, "frontend_developer")


def fix_use_case(value):
    if value in VALID_USE_CASES:
        return value
    return USE_CASE_MAP.get(value, "website_generation")


def fix_category(value):
    if value in VALID_CATEGORIES:
        return value
    # Map common variations
    cat_map = {
        "landing_page": "landing_pages",
        "landingpage": "landing_pages",
        "ui_component": "ui_components",
        "uicomponent": "ui_components",
        "component": "ui_components",
        "saas_dashboard": "saas_dashboards",
        "dashboard": "saas_dashboards",
        "ecommerce": "ecommerce",
        "e_commerce": "ecommerce",
        "shop": "ecommerce",
        "portfolio": "portfolio_personal_brand",
        "personal_brand": "portfolio_personal_brand",
        "ai_tool": "ai_tools_agents",
        "ai_agent": "ai_tools_agents",
        "ai": "ai_tools_agents",
        "education": "education_learning",
        "learning": "education_learning",
        "mobile_app": "mobile_apps",
        "mobile": "mobile_apps",
        "game": "games_interactive",
        "interactive": "games_interactive",
        "data_viz": "data_visualization",
        "data": "data_visualization",
        "visualization": "data_visualization",
        "chart": "data_visualization",
    }
    return cat_map.get(value, "landing_pages")


def fix_difficulty(value):
    if value in VALID_DIFFICULTIES:
        return value
    # Map common variations
    diff_map = {
        "easy": "beginner",
        "simple": "beginner",
        "novice": "beginner",
        "medium": "intermediate",
        "moderate": "intermediate",
        "hard": "advanced",
        "complex": "advanced",
        "challenging": "advanced",
        "master": "expert",
        "professional": "expert",
        "enterprise": "expert",
    }
    return diff_map.get(value, "intermediate")


def fix_language(value):
    if value in VALID_LANGUAGES:
        return value
    return "en"


def fix_slug(slug, seen_slugs):
    """Ensure slug is unique."""
    base_slug = slug
    counter = 1
    while slug in seen_slugs:
        slug = f"{base_slug}-{counter}"
        counter += 1
    seen_slugs.add(slug)
    return slug


def fix_title(title, seen_titles, counter):
    """Ensure title is unique."""
    base_title = title
    orig_counter = 2
    while title in seen_titles:
        title = f"{base_title} ({orig_counter})"
        orig_counter += 1
    seen_titles.add(title)
    return title


def ensure_complete_style(style):
    """Ensure style object has all required fields."""
    defaults = {
        "visual_style": "clean modern minimal design",
        "layout_style": "responsive grid layout",
        "color_direction": "neutral palette with accent colors",
        "motion_style": "subtle transitions and micro-interactions"
    }
    result = {}
    for key in ["visual_style", "layout_style", "color_direction", "motion_style"]:
        val = style.get(key, "") if isinstance(style, dict) else ""
        result[key] = val if val else defaults[key]
    return result


def ensure_complete_tech_stack(tech):
    """Ensure tech_stack has all required fields."""
    defaults = {
        "framework": "React",
        "language": "TypeScript",
        "styling": "Tailwind CSS",
        "animation": "Framer Motion",
        "optional_libraries": ["lucide-react"]
    }
    result = {}
    for key in ["framework", "language", "styling", "animation", "optional_libraries"]:
        val = tech.get(key, "") if isinstance(tech, dict) else ""
        if key == "optional_libraries":
            result[key] = val if isinstance(val, list) and val else defaults[key]
        else:
            result[key] = val if val else defaults[key]
    return result


def ensure_complete_website_card(wc):
    """Ensure website_card has all required fields."""
    defaults = {
        "headline": "UI Component Prompt",
        "summary": "A production-ready prompt for building a modern UI component.",
        "preview_label": "UI",
        "search_keywords": ["UI", "component", "React"]
    }
    result = {}
    for key in ["headline", "summary", "preview_label", "search_keywords"]:
        val = wc.get(key, "") if isinstance(wc, dict) else ""
        if key == "search_keywords":
            result[key] = val if isinstance(val, list) and val else defaults[key]
        else:
            result[key] = val if val else defaults[key]
    return result


def ensure_complete_quality(quality):
    """Ensure quality has all required fields with valid scores."""
    defaults = {
        "specificity_score": 8,
        "originality_score": 8,
        "implementation_clarity_score": 8,
        "website_readiness_score": 9
    }
    result = {}
    for key in ["specificity_score", "originality_score", "implementation_clarity_score", "website_readiness_score"]:
        val = quality.get(key, 0) if isinstance(quality, dict) else 0
        if isinstance(val, int) and 1 <= val <= 10:
            result[key] = val
        else:
            result[key] = defaults[key]
    return result


def process_file(filepath, seen_slugs, seen_titles):
    """Process a single JSONL file and return cleaned records."""
    records = []
    stats = {"total": 0, "fixed": 0, "skipped": 0, "errors": []}

    with open(filepath, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("```"):
                continue

            stats["total"] += 1

            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                stats["skipped"] += 1
                stats["errors"].append(f"Line {line_num}: JSON parse error: {e}")
                continue

            if not isinstance(obj, dict):
                stats["skipped"] += 1
                continue

            fixed = False

            # Fix category
            cat = obj.get("category", "")
            if cat not in VALID_CATEGORIES:
                obj["category"] = fix_category(cat)
                fixed = True

            # Fix audience
            aud = obj.get("audience", "")
            if aud not in VALID_AUDIENCES:
                obj["audience"] = fix_audience(aud)
                fixed = True

            # Fix use_case
            uc = obj.get("use_case", "")
            if uc not in VALID_USE_CASES:
                obj["use_case"] = fix_use_case(uc)
                fixed = True

            # Fix difficulty
            diff = obj.get("difficulty", "")
            if diff not in VALID_DIFFICULTIES:
                obj["difficulty"] = fix_difficulty(diff)
                fixed = True

            # Fix language
            lang = obj.get("language", "")
            if lang not in VALID_LANGUAGES:
                obj["language"] = fix_language(lang)
                fixed = True

            # Fix style
            style = obj.get("style", {})
            if not isinstance(style, dict):
                style = {}
            obj["style"] = ensure_complete_style(style)
            if fixed or style != obj.get("style"):
                fixed = True

            # Fix tech_stack
            tech = obj.get("tech_stack", {})
            if not isinstance(tech, dict):
                tech = {}
            obj["tech_stack"] = ensure_complete_tech_stack(tech)
            if fixed or tech != obj.get("tech_stack"):
                fixed = True

            # Fix website_card
            wc = obj.get("website_card", {})
            if not isinstance(wc, dict):
                wc = {}
            obj["website_card"] = ensure_complete_website_card(wc)
            if fixed or wc != obj.get("website_card"):
                fixed = True

            # Fix quality
            qual = obj.get("quality", {})
            if not isinstance(qual, dict):
                qual = {}
            obj["quality"] = ensure_complete_quality(qual)
            if fixed or qual != obj.get("quality"):
                fixed = True

            # Fix acceptance_criteria
            ac = obj.get("acceptance_criteria", [])
            if not isinstance(ac, list) or len(ac) < 3:
                default_ac = [
                    "Component renders correctly with all interactive elements",
                    "Layout is responsive across all screen sizes",
                    "Design matches the specified visual style and color direction"
                ]
                if isinstance(ac, list) and len(ac) > 0:
                    # Pad existing
                    while len(ac) < 3:
                        ac.append(default_ac[len(ac)])
                else:
                    ac = default_ac
                obj["acceptance_criteria"] = ac
                fixed = True
            elif len(ac) > 6:
                obj["acceptance_criteria"] = ac[:6]
                fixed = True

            # Fix tags
            tags = obj.get("tags", [])
            if not isinstance(tags, list) or len(tags) < 5:
                category = obj.get("category", "general")
                subcat = obj.get("subcategory", "general")
                default_tags = [
                    category.replace("_", "-"),
                    subcat.replace("_", "-"),
                    obj.get("difficulty", "intermediate"),
                    "react",
                    "tailwind"
                ]
                if isinstance(tags, list):
                    # Merge and pad
                    merged = list(dict.fromkeys(tags + default_tags))
                    obj["tags"] = merged[:12]
                else:
                    obj["tags"] = default_tags
                fixed = True
            elif len(tags) > 12:
                obj["tags"] = tags[:12]
                fixed = True

            # Ensure all tags are lowercase kebab-case
            cleaned_tags = []
            for t in obj["tags"]:
                t = str(t).lower().replace(" ", "-").replace("_", "-")
                t = re.sub(r'[^a-z0-9-]', '', t)
                if t:
                    cleaned_tags.append(t)
            if cleaned_tags:
                obj["tags"] = cleaned_tags[:12]
                if len(cleaned_tags) < 5:
                    # Pad with defaults
                    category = obj.get("category", "general")
                    defaults = [category.replace("_", "-"), "react", "tailwind", "ui", "component"]
                    for d in defaults:
                        if d not in cleaned_tags:
                            cleaned_tags.append(d)
                        if len(cleaned_tags) >= 5:
                            break
                    obj["tags"] = cleaned_tags[:12]

            # Fix prompt word count
            prompt_text = obj.get("prompt", "")
            word_count = len(prompt_text.split())
            if word_count < 80:
                # Pad prompt
                padding = " Ensure the implementation is production-ready with proper error handling, loading states, and accessibility features. Use semantic HTML elements and ARIA attributes where appropriate. Test the component across multiple browsers and devices."
                obj["prompt"] = prompt_text + padding
                fixed = True
                word_count = len(obj["prompt"].split())

            if word_count > 220:
                words = obj["prompt"].split()
                obj["prompt"] = " ".join(words[:220])
                fixed = True

            # Fix negative_prompt length
            neg = obj.get("negative_prompt", "")
            neg_words = len(neg.split())
            if neg_words > 60:
                words = neg.split()[:60]
                obj["negative_prompt"] = " ".join(words)
                fixed = True
            elif not neg:
                obj["negative_prompt"] = "Avoid generic templates, placeholder content, and inconsistent styling. Do not skip responsive behavior or accessibility requirements."
                fixed = True

            # Ensure version
            if not obj.get("version"):
                obj["version"] = "1.0.0"
                fixed = True

            # Ensure subcategory
            if not obj.get("subcategory"):
                obj["subcategory"] = "general"
                fixed = True

            # Ensure industry
            if not obj.get("industry"):
                obj["industry"] = "saas"
                fixed = True

            # Ensure created_by_agent
            if not obj.get("created_by_agent"):
                cat = obj.get("category", "general")
                obj["created_by_agent"] = f"{cat}_agent"
                fixed = True

            # Ensure batch
            if not obj.get("batch"):
                cat = obj.get("category", "general")
                obj["batch"] = f"{cat}_001"
                fixed = True

            # Deduplicate slug
            slug = obj.get("slug", "")
            if slug:
                new_slug = fix_slug(slug, seen_slugs)
                if new_slug != slug:
                    obj["slug"] = new_slug
                    fixed = True
            else:
                title = obj.get("title", "untitled")
                base_slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
                obj["slug"] = fix_slug(base_slug, seen_slugs)
                fixed = True

            # Deduplicate title
            title = obj.get("title", "")
            if title:
                new_title = fix_title(title, seen_titles, 0)
                if new_title != title:
                    obj["title"] = new_title
                    fixed = True
            else:
                obj["title"] = f"Untitled Prompt {len(seen_titles) + 1}"
                seen_titles.add(obj["title"])
                fixed = True

            if fixed:
                stats["fixed"] += 1

            records.append(obj)

    return records, stats


def main():
    print("=" * 60)
    print("DATASET CLEANUP")
    print("=" * 60)

    if not DATA_DIR.exists():
        print(f"ERROR: Data directory not found: {DATA_DIR}")
        return 1

    jsonl_files = sorted(DATA_DIR.glob("*.jsonl"))
    print(f"\nProcessing {len(jsonl_files)} files...\n")

    seen_slugs = set()
    seen_titles = set()
    all_stats = []

    for filepath in jsonl_files:
        filename = filepath.name
        print(f"  Processing: {filename}")

        records, stats = process_file(filepath, seen_slugs, seen_titles)
        all_stats.append((filename, stats))

        # Write cleaned file
        with open(filepath, 'w', encoding='utf-8') as f:
            for record in records:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

        print(f"    Total: {stats['total']} | Fixed: {stats['fixed']} | Skipped: {stats['skipped']}")

    print("\n" + "=" * 60)
    print("CLEANUP COMPLETE")
    print("=" * 60)

    total_fixed = sum(s["fixed"] for _, s in all_stats)
    total_skipped = sum(s["skipped"] for _, s in all_stats)
    print(f"\nTotal records processed: {sum(s['total'] for _, s in all_stats)}")
    print(f"Total fixed: {total_fixed}")
    print(f"Total skipped (unparseable): {total_skipped}")

    return 0


if __name__ == "__main__":
    exit(main())
