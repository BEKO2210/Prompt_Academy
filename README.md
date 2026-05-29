# Prompt Library 10000 — Dataset Delivery

## Overview

This package contains **10,000+ production-ready prompts** for website generation, UI component creation, dashboard building, app prototyping, and interactive experience design. The dataset is structured for direct import into a prompt library website or AI-powered design tool.

## Package Contents

```
prompt_dataset_delivery/
  README.md                          <- this file
  manifest.json                      <- dataset metadata and category index
  website_index.json                 <- flattened index for quick web display
  schema/
    prompt.schema.json               <- JSON schema for individual prompt validation
    manifest.schema.json             <- JSON schema for manifest validation
  data/
    01_landing_pages.jsonl           <- 1,000+ landing page prompts
    02_ui_components.jsonl           <- 1,000+ UI component prompts
    03_saas_dashboards.jsonl         <- 1,000+ SaaS dashboard prompts
    04_ecommerce.jsonl               <- 1,000+ e-commerce prompts
    05_portfolio_personal_brand.jsonl<- 1,000+ portfolio prompts
    06_ai_tools_agents.jsonl         <- 1,000+ AI tool/agent prompts
    07_education_learning.jsonl      <- 1,000+ education prompts
    08_mobile_apps.jsonl             <- 1,000+ mobile app prompts
    09_games_interactive.jsonl       <- 1,000+ game/interactive prompts
    10_data_visualization.jsonl      <- 1,000+ data visualization prompts
  reports/
    generation_report.md             <- how the dataset was generated
    quality_report.md                <- PASS/FAIL quality assessment
    duplicate_report.json            <- duplicate detection results
    category_stats.json              <- per-category statistics
    validation_errors.json           <- schema validation findings
  scripts/
    validate_dataset.py              <- run to validate all JSONL files
    dedupe_dataset.py                <- run to detect duplicates
    build_website_index.py           <- run to regenerate website_index.json
```

## Quick Start

### 1. Validate the Dataset

```bash
cd prompt_dataset_delivery
python scripts/validate_dataset.py
```

This checks:
- JSON validity of every line
- Required field presence
- Global ID uniqueness
- Global slug uniqueness
- Score ranges
- Difficulty enum values

### 2. Check for Duplicates

```bash
python scripts/dedupe_dataset.py
```

This detects:
- Exact fingerprint duplicates
- Similar titles
- Repeated opening phrases
- Overused first-5-word patterns

### 3. Import into Your Website

```python
import json

# Load all prompts
all_prompts = []
for i in range(1, 11):
    filename = f"data/{i:02d}_*.jsonl"
    # ... parse each line as JSON

# Or use the website_index.json for a quick preview
with open("website_index.json") as f:
    index = json.load(f)
    for item in index["items"]:
        print(item["title"], item["category"], item["difficulty"])
```

## Prompt Schema

Every prompt follows a consistent schema with these key fields:

| Field | Description |
|-------|-------------|
| `id` | Global unique ID (PRM-000001, PRM-000002, ...) |
| `category` | Top-level category (landing_pages, ui_components, ...) |
| `subcategory` | Specific type (hero_section, pricing_table, ...) |
| `title` | Human-readable title |
| `slug` | URL-friendly identifier |
| `difficulty` | beginner / intermediate / advanced / expert |
| `audience` | Target user (developer, designer, founder, ...) |
| `use_case` | What the prompt is for |
| `industry` | Business vertical |
| `style` | Visual, layout, color, motion direction |
| `tech_stack` | Framework, language, styling, animation |
| `prompt` | The actual prompt text (80-220 words) |
| `negative_prompt` | What to avoid |
| `acceptance_criteria` | 3-6 quality checkpoints |
| `tags` | 5-12 searchable tags |
| `website_card` | Pre-built card data for web display |
| `quality` | Internally-assessed quality scores |

## Categories at a Glance

| # | Category | Focus Area |
|---|----------|-----------|
| 1 | landing_pages | Hero sections, SaaS sites, product pages, campaigns |
| 2 | ui_components | Navbars, cards, modals, tabs, forms, bento grids |
| 3 | saas_dashboards | Admin, analytics, CRM, finance, AI ops, PM |
| 4 | ecommerce | Product pages, shops, checkout, filters, brands |
| 5 | portfolio_personal_brand | Developer, designer, AI engineer, founder portfolios |
| 6 | ai_tools_agents | Agent UIs, chat interfaces, workflow builders |
| 7 | education_learning | Learning platforms, courses, quizzes, flashcards |
| 8 | mobile_apps | Onboarding, trackers, finance, fitness, AI companions |
| 9 | games_interactive | Game landings, idle games, HUDs, gamified apps |
| 10 | data_visualization | Charts, infographics, maps, KPI boards, timelines |

## Quality Assurance

All prompts were:
- Generated with structured diversity constraints (20+ subcategories, 25+ industries per category)
- Validated against a strict JSON schema
- Checked for duplicates using fingerprint hashing
- Scored on specificity, originality, implementation clarity, and website readiness
- Reviewed for varied opening verbs and sentence structures

## License & Usage

This dataset is provided as-is for building prompt libraries, design tools, and AI-assisted workflows. Each prompt is a textual description intended to guide generative AI systems in producing high-quality UI/UX output.

## Dataset Version

- **Version**: 1.0.0
- **Total Prompts**: 10,000+
- **Categories**: 10
- **Format**: JSONL (UTF-8)
- **Generated**: 2026-05-29
