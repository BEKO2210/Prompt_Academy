/**
 * Deterministic descriptive/actionable field split (ENG-008 §3).
 *
 * This is THE INDEPENDENT VARIABLE of the H1 experiment. Arms C and D differ by
 * nothing except which side of this split they receive, so the split must be:
 *
 *   - deterministic       — same record in, same C and D out, byte for byte
 *   - documented          — every field assigned by a rule you can read here
 *   - frozen              — versioned, and never changed mid-run
 *   - never model-decided — an LLM choosing the split would make C and D a
 *                           function of the model under test
 *
 * ## Resolving a conflict in the ticket
 *
 * ENG-008 §3 specifies BOTH "arm B = the full record, verbatim" AND the binding
 * assertion `B = C ∪ D`. Those cannot both hold literally: a record also carries
 * `id`, `slug`, `quality.*`, `batch` and `created_by_agent`, which belong to
 * neither the descriptive nor the actionable side.
 *
 * Resolved by defining an INJECTABLE set. B is the full injectable record; C and
 * D partition it exactly. Everything outside the injectable set is retrieval and
 * provenance metadata and enters NO arm — including B.
 *
 * The excluded fields, and why each is excluded:
 *
 *   id, slug, batch, created_by_agent   provenance; tells the model nothing
 *                                       about the task
 *   quality.*                           self-reported by the generating agent,
 *                                       not independently validated (AGENTS.md).
 *                                       Injecting it would feed the model a
 *                                       score it had no way to earn.
 *   title, category, subcategory,       retrieval keys. They are how the record
 *   tags, website_card.*, audience,     was FOUND, not instructions for the
 *   industry, use_case, difficulty,     work. Injecting them would leak the
 *   language, version                   retrieval decision into the output.
 *
 * This narrows arm B relative to a literal reading of the ticket. It is recorded
 * rather than silently applied, and `B = C ∪ D` is asserted by test.
 */

/** Bump on ANY change to the assignment rules. Frozen before a run. */
export const FIELD_SPLIT_VERSION = "1.0.0";

/** A dataset record, as stored in data/*.jsonl. Only the fields we touch. */
export interface SkillRecord {
  id: string;
  prompt?: string;
  negative_prompt?: string;
  acceptance_criteria?: string[];
  style?: Record<string, string>;
  tech_stack?: Record<string, string | string[]>;
  [k: string]: unknown;
}

/**
 * Descriptive fields — what the thing IS and how it should feel.
 * Prose and aesthetic direction. Nothing checkable.
 */
export const DESCRIPTIVE_FIELDS = ["prompt", "style"] as const;

/**
 * Actionable fields — what the output MUST and MUST NOT do.
 * Constraints a reader could check an artifact against.
 */
export const ACTIONABLE_FIELDS = [
  "acceptance_criteria",
  "negative_prompt",
  "tech_stack",
] as const;

/** Every field either arm may receive. The union, and nothing else. */
export const INJECTABLE_FIELDS: readonly string[] = [
  ...DESCRIPTIVE_FIELDS,
  ...ACTIONABLE_FIELDS,
];

export interface SplitContext {
  /** Section title -> rendered text. Ordered; rendering is order-stable. */
  sections: Array<{ field: string; text: string }>;
}

/** Render one value to text. One function, so C and D cannot format differently. */
function renderField(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.trim() ? value.trim() : null;
  }
  if (Array.isArray(value)) {
    const items = value.filter((v) => typeof v === "string" && v.trim());
    return items.length ? items.map((v) => `- ${String(v).trim()}`).join("\n") : null;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v != null && String(v).trim())
      .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    return entries.length ? entries.join("\n") : null;
  }
  return null;
}

function collect(rec: SkillRecord, fields: readonly string[]): SplitContext {
  const sections: SplitContext["sections"] = [];
  for (const f of fields) {
    const text = renderField(rec[f]);
    if (text !== null) sections.push({ field: f, text });
  }
  return { sections };
}

/** Arm C's context: the descriptive side. */
export function descriptiveContext(rec: SkillRecord): SplitContext {
  return collect(rec, DESCRIPTIVE_FIELDS);
}

/** Arm D's context: the actionable side. */
export function actionableContext(rec: SkillRecord): SplitContext {
  return collect(rec, ACTIONABLE_FIELDS);
}

/**
 * Arm B's context: the full injectable record.
 * Built from the same field list so `B = C ∪ D` holds by construction, not by
 * two code paths that happen to agree today.
 */
export function fullInjectableContext(rec: SkillRecord): SplitContext {
  return collect(rec, INJECTABLE_FIELDS);
}

/** Stable text rendering of a context. Used by every arm; no per-arm formatting. */
export function renderContext(ctx: SplitContext): string {
  return ctx.sections
    .map((s) => `## ${s.field}\n${s.text}`)
    .join("\n\n");
}
