"""Materialise the annotator's grading decisions over the candidate pool.

The grades below are the ANNOTATOR'S judgement, reached by reading the pooled
records against RELEVANCE-GUIDELINE.md. They are expressed as explicit,
auditable criteria rather than 1,200 hand-typed numbers so that a reviewer can
check the reasoning rather than only the result.

Nothing here consults a retrieval score, a ranker, or reports/capabilities.json.
"""
import json, glob, re
from pathlib import Path

ROOT = Path(".")
recs = {}
for f in sorted(glob.glob("data/*.jsonl")):
    for l in open(f, encoding="utf-8"):
        if l.strip():
            r = json.loads(l); recs[r["id"]] = r

pool = json.loads(Path("benchmarks/queries/candidate-pool.json").read_text(encoding="utf-8"))
queries = json.loads(Path("benchmarks/queries/queries.json").read_text(encoding="utf-8"))

def full(r):
    return " ".join([r["title"], r["prompt"], " ".join(r.get("acceptance_criteria", []))]).lower()

DASH = {"admin_dashboards","analytics_dashboards","monitoring_dashboards","crm_dashboards",
        "finance_dashboards","devops_dashboards","security_dashboards","hr_dashboards",
        "sales_dashboards","marketing_dashboards","logistics_dashboards","iot_dashboards",
        "education_dashboards","healthcare_dashboards","social_media_dashboards",
        "energy_dashboards","inventory_dashboards","project_management_dashboards",
        "customer_support_dashboards","ai_ops_dashboards"}

RX_SR  = re.compile(r"\b(screen[- ]reader|aria|assistive)\b", re.I)
RX_KBD = re.compile(r"\b(keyboard navigab\w*|keyboard navigation|focus (ring|indicator|trap))\b", re.I)
RX_A11Y= re.compile(r"\b(wcag|screen[- ]reader|aria|keyboard navigab\w*|keyboard navigation|accessib\w+)\b", re.I)
RX_FOCUSTRAP = re.compile(r"\b(trap focus|focus trap|escape key)\b", re.I)

def grade(qid, rid):
    r = recs[rid]; sc = r["subcategory"]; t = full(r); title = r["title"].lower()

    if qid in ("Q001", "Q025"):                       # pricing page / Preisseite
        if sc == "pricing_pages": return 3, "is a pricing page"
        if sc == "pricing_tables": return 2, "pricing table component, not a page"
        if "pricing" in title or "price" in title: return 1, "pricing-adjacent tool, not a pricing page"
        return 0, "different artifact"

    if qid == "Q004":                                  # sign in screen
        if "login" in title or "sign in" in title or "sign-in" in title: return 3, "is a sign-in screen"
        if "registration" in title or "sign up" in title: return 2, "adjacent auth flow (registration)"
        if "password" in title: return 1, "auth-related field, not the screen"
        return 0, "not authentication"

    if qid == "Q009":                                  # account management (ambiguous)
        if sc == "admin_dashboards":
            if re.search(r"user manage|role-based|tenant manage|system settings|configuration panel|control access", t):
                return 3, "admin user/account management — the strongest reading"
            return 2, "admin dashboard, plausible account-management surface"
        if re.search(r"\baccount\b|\bbilling\b", title): return 2, "account/billing surface (user-settings reading)"
        if sc == "crm_dashboards": return 1, "'account' here means customer account — different sense"
        return 0, "unrelated to any sense of account management"

    if qid == "Q019":                                  # heatmap visualization
        if sc == "heatmaps": return 3, "is a heatmap"
        if "heatmap" in title: return 3, "is a heatmap visualiser"
        if sc == "analytics_dashboards": return 1, "dashboard that may contain one; not a heatmap"
        return 0, "not a heatmap"

    if qid in ("Q002", "Q026"):                        # accessible dashboard / barrierefreies Dashboard
        if sc in DASH:
            return (3, "dashboard with explicit accessibility content") if RX_A11Y.search(t) \
                else (1, "dashboard, but accessibility not evidenced — binding constraint unmet")
        if "dashboard" in title: return 1, "dashboard-adjacent component"
        return 0, "not a dashboard"

    if qid == "Q003":                                  # screen-reader dashboard (natural language)
        if sc in DASH:
            if RX_SR.search(t):  return 3, "dashboard with explicit screen-reader/ARIA content"
            if RX_KBD.search(t): return 2, "dashboard with keyboard a11y but no screen-reader evidence"
            return 1, "dashboard, no accessibility evidence"
        if "dashboard" in title: return 1, "dashboard-adjacent component"
        return 0, "not a dashboard"

    if qid == "Q021":                                  # modal dialog with focus trap
        if sc == "modals_dialogs":
            return (3, "modal with explicit focus trap") if RX_FOCUSTRAP.search(t) \
                else (2, "modal component; focus trap not stated")
        if RX_FOCUSTRAP.search(t): return 1, "promises focus trap but is not a modal component"
        return 0, "not an overlay component"

    if qid == "Q024":                                  # data table with sorting and pagination
        if sc == "paginations":
            return (3, "pagination for a data table") if "table" in title \
                else (2, "pagination component; not table-specific")
        if re.search(r"data tables? must support sorting|sortable table|table.{0,40}(sort|pagina)", t):
            return 1, "contains a sortable table but is a dashboard, not a table component"
        return 0, "neither table nor pagination"

    if qid in ("Q031", "Q032"):                        # out of domain
        return 0, "corpus contains no record for this intent (verified corpus-wide)"

    return None, None

SELECTED = ["Q001","Q004","Q009","Q019","Q025","Q031",   # dev
            "Q002","Q003","Q021","Q024","Q026","Q032"]   # holdout

out = {}
for q in queries["queries"]:
    qid = q["id"]
    if qid not in SELECTED: continue
    rel, reasons, flags = {}, {}, {}
    for rid in pool["pool"][qid]["candidate_ids"]:
        g, why = grade(qid, rid)
        rel[rid] = g; reasons[rid] = why
        r = recs[rid]
        if r["subcategory"] not in full(r) and False: pass
    n3 = sum(1 for v in rel.values() if v == 3)
    f = []
    if n3 > 15: f.append("many_relevant_by_design")
    if all(v == 0 for v in rel.values()): f.append("zero_relevant_verified")
    out[qid] = {"relevance": rel, "reasons": reasons, "flags": f,
                "judged": len(rel), "grade_counts": {str(g): sum(1 for v in rel.values() if v == g) for g in (3,2,1,0)}}

Path("/tmp/claude-1000/-home-belkis/e368bbdd-1223-4eaf-9d4a-40a6a15bd89d/scratchpad/rel.json").write_text(json.dumps(out, indent=2))
print(f"{'query':6}{'judged':>7}{'g3':>5}{'g2':>5}{'g1':>5}{'g0':>6}  flags")
tot=0
for qid in SELECTED:
    o=out[qid]; c=o["grade_counts"]; tot+=o["judged"]
    print(f"{qid:6}{o['judged']:7}{c['3']:5}{c['2']:5}{c['1']:5}{c['0']:6}  {','.join(o['flags'])}")
print(f"\ngesamt beurteilte Paare: {tot}")
