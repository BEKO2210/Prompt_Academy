/**
 * Generic deterministic checks for the H1 evaluator (ENG-014).
 *
 * ## What this is for
 *
 * The audit of the first Layer 2 found 81% of checks needing human judgement and
 * 24 of 50 tasks with no automated check at all, which made the headline metric
 * constantly zero. This module is the fix — but only for the part that is
 * legitimately mechanisable.
 *
 * ## The rule this module is built around
 *
 * **A human criterion is never rewritten into a weaker pattern and then called
 * automated.** "Visually polished", "the danger zone is visually separated",
 * "labels remain legible" are not regex questions, and a check pretending
 * otherwise would raise the coverage number while lowering the measurement's
 * worth. Those stay human.
 *
 * What IS mechanisable is structural: an element exists, an attribute is set, a
 * handler is bound, a dependency is absent, a breakpoint is declared, N of
 * something occur. Those are checked here.
 *
 * ## What these checks do NOT establish
 *
 * They read source text. They therefore verify STRUCTURE, never BEHAVIOUR. A
 * `handler` check proves a drop handler is bound, not that dropping a file
 * works. Every reported result has to carry that qualification, which is why the
 * metric is named `deterministicCompliance` and not `correctness`.
 *
 * Known false-positive sources, stated rather than discovered later:
 *   - a pattern inside a comment or a string literal counts as present
 *   - a handler bound but never used counts as bound
 *   - framework variety means a check tuned to React idioms can miss a valid
 *     Vue or Svelte answer; every kind below accepts several dialects
 */

/** Bump on ANY change to check semantics. Frozen before an H1 run. */
export const CHECKS_VERSION = "1.0.0";

export type CheckKind =
  | "contains"
  | "absent"
  | "regex"
  | "element"
  | "attribute"
  | "handler"
  | "count_min"
  | "breakpoint"
  | "import_absent"
  | "artifact"
  | "any_of"
  | "regex_absent"
  | "human";

export interface CheckSpec {
  id: string;
  kind: CheckKind;
  value: string;
  /** Audit class: see reports/eng-014-evaluation-audit.md. */
  cls?: "A" | "B" | "C" | "D";
}

/** Strip comments and string literals — used where a false positive is costly. */
export function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/**
 * An element is present.
 *
 * Accepts several dialects for the same intent, because the arms may answer in
 * different frameworks and a check tuned to one would measure framework choice
 * rather than task performance:
 *   <form   <Form   role="form"   <v-form   <ion-form
 */
function elementPresent(src: string, name: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `<\\s*(?:[a-z]+-)?${n}\\b|<\\s*${n[0]!.toUpperCase()}${n.slice(1)}\\b|role\\s*=\\s*["']${n}["']`,
    "i",
  ).test(src);
}

/** An attribute is set. Covers HTML, JSX and the common binding syntaxes. */
function attributePresent(src: string, attr: string): boolean {
  const a = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // aria-modal / ariaModal / :aria-modal / [ariaModal]
  const camel = attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const c = camel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s:\\[{])${a}\\s*[=:]|(?:^|[\\s:\\[{])${c}\\s*[=:]`, "i").test(src);
}

/**
 * A handler for an event is bound.
 *
 * onDrop= / onDrop: / @drop= / v-on:drop / on:drop= / addEventListener("drop"
 * / (drop)= (Angular). Deliberately broad: a false negative here would score a
 * correct answer as wrong because it used an unexpected framework.
 */
function handlerPresent(src: string, event: string): boolean {
  const e = event.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cap = e[0]!.toUpperCase() + e.slice(1);
  return new RegExp(
    `on${cap}\\s*[=:]|@${e}\\b|v-on:${e}\\b|on:${e}\\b|\\(${e}\\)\\s*=|addEventListener\\s*\\(\\s*["']${e}["']`,
    "i",
  ).test(src);
}

/**
 * "patternA|||patternB" — passes if ANY alternative matches.
 *
 * Exists because counting elements is unsound over generated markup: six inputs
 * rendered by `[0,1,2,3,4,5].map(...)` occur ONCE in the source. A count check
 * alone scores that correct answer as wrong (measured: it did). The alternatives
 * let a check accept either the literal repetition or the loop that produces it.
 */
function anyOf(src: string, spec: string): boolean {
  return spec.split("|||").some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(src);
    } catch {
      return false;
    }
  });
}

/** "N::pattern" — at least N distinct matches of pattern. */
function countMin(src: string, spec: string): boolean {
  const idx = spec.indexOf("::");
  const n = Number(spec.slice(0, idx));
  const pattern = spec.slice(idx + 2);
  let rx: RegExp;
  try {
    rx = new RegExp(pattern, "gi");
  } catch {
    return false;
  }
  return (src.match(rx) ?? []).length >= n;
}

/**
 * A responsive breakpoint is declared.
 *
 * Media query, container query, or a utility-framework responsive prefix. Not
 * "the layout is responsive" — that is a human judgement and stays one.
 */
function breakpointPresent(src: string): boolean {
  return /@media\b|@container\b|\b(?:sm|md|lg|xl):[a-z-]|useMediaQuery|matchMedia|breakpoint/i.test(src);
}

/** A dependency is not imported. Checked on code only, so a mention in prose is fine. */
function importAbsent(src: string, pkg: string): boolean {
  const p = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !new RegExp(
    `(?:import|require|from)\\s*\\(?\\s*["'][^"']*${p}|["'][^"']*${p}[^"']*["']\\s*\\)`,
    "i",
  ).test(codeOnly(src));
}

/**
 * The output actually contains a code artifact of the requested sort.
 *
 * This replaces 50 `required_artifacts` entries that were previously
 * unresolvable prose ("a component file"). It is the single highest-leverage
 * check in the set: every task has one, and an answer that returns prose instead
 * of code fails it in every arm equally.
 */
function artifactPresent(src: string, kind: string): boolean {
  // The "does this look like code at all" precondition used to be JS-shaped
  // (function/const/export/<tag>) and therefore REJECTED a perfectly good YAML
  // workflow. Found by sensitivity testing against hand-written good answers,
  // which is what that testing is for. Each artifact kind now brings its own
  // evidence rather than passing through one language's idea of code.
  switch (kind) {
    case "component":
      // A COMPLETE HTML DOCUMENT is a component artifact. Requiring
      // export/`<template>`/`@Component` encoded an unstated assumption that the
      // answer would use a JavaScript framework — the tasks never said so, and
      // the pilot returned working HTML pages that this rejected (ENG-015).
      // That failed valid answers in every arm for a reason unrelated to the
      // experimental variable, adding noise rather than signal.
      return /export\s+(?:default\s+)?(?:function|const|class)|<template|<script|@Component|function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*=|<!DOCTYPE\s+html|<html\b/i.test(src);
    case "test":
      return /\b(?:describe|it|test|expect|assert)\s*\(/.test(src);
    case "workflow":
      return /\bjobs\s*:|runs-on\s*:|steps\s*:/.test(src);
    case "any":
      return /```|<[a-zA-Z][^>]*>|function\s|const\s|class\s|def\s|export\s/.test(src);
    case "config":
      return /=|:/.test(src) && /\benv\b|environment|config|process\.env|import\.meta\.env/i.test(src);
    case "module":
      return /export\s|module\.exports|def\s|func\s|router\.|app\.(get|post|use)/.test(src);
    default:
      return /```|<[a-zA-Z][^>]*>|function\s|const\s|class\s|def\s|export\s/.test(src);
  }
}

export type CheckStatus = "pass" | "fail" | "unresolved";

export interface CheckOutcome {
  id: string;
  kind: CheckKind;
  status: CheckStatus;
  detail: string;
}

/**
 * Run one check. `human` is always unresolved here — it is resolved by the
 * human rubric pass, never by this module.
 */
export function runCheck(output: string, c: CheckSpec): CheckOutcome {
  const ok = (v: boolean, yes: string, no: string): CheckOutcome =>
    ({ id: c.id, kind: c.kind, status: v ? "pass" : "fail", detail: v ? yes : no });

  switch (c.kind) {
    case "human":
      return { id: c.id, kind: c.kind, status: "unresolved", detail: "requires human judgement" };
    case "contains":
      return ok(output.includes(c.value), "present", "missing");
    case "absent":
      return ok(!output.includes(c.value), "absent as required", "present but must not be");
    case "regex": {
      let rx: RegExp;
      try {
        rx = new RegExp(c.value, "i");
      } catch {
        // A broken pattern is a harness defect. Scoring it as a fail would blame
        // the model for our typo.
        return { id: c.id, kind: c.kind, status: "unresolved", detail: "invalid pattern in Layer 2" };
      }
      return ok(rx.test(output), "pattern matched", "pattern did not match");
    }
    case "element":
      return ok(elementPresent(output, c.value), `<${c.value}> present`, `<${c.value}> missing`);
    case "attribute":
      return ok(attributePresent(output, c.value), `${c.value} set`, `${c.value} not set`);
    case "handler":
      return ok(handlerPresent(output, c.value), `${c.value} handler bound`, `no ${c.value} handler`);
    case "count_min":
      return ok(countMin(output, c.value), "count met", "count not met");
    case "breakpoint":
      return ok(breakpointPresent(output), "breakpoint declared", "no breakpoint declared");
    case "import_absent":
      return ok(importAbsent(output, c.value), `${c.value} not imported`, `${c.value} imported`);
    case "artifact":
      return ok(artifactPresent(output, c.value), `${c.value} artifact present`, `no ${c.value} artifact`);
    case "any_of":
      return ok(anyOf(output, c.value), "an alternative matched", "no alternative matched");
    case "regex_absent": {
      // For criteria phrased as a PROHIBITION. Testing the positive instead
      // fails an output that commits no violation, which is backwards: an
      // answer containing no secret at all satisfies "secrets are never written
      // into the file". Found in the pilot (ENG-015).
      let rx: RegExp;
      try {
        rx = new RegExp(c.value, "i");
      } catch {
        return { id: c.id, kind: c.kind, status: "unresolved", detail: "invalid pattern in Layer 2" };
      }
      return ok(!rx.test(output), "no violation found", "a violation is present");
    }
  }
}

/** Kinds this module resolves without a human. */
export const DETERMINISTIC_KINDS: ReadonlySet<CheckKind> = new Set<CheckKind>([
  "contains", "absent", "regex", "element", "attribute",
  "handler", "count_min", "breakpoint", "import_absent", "artifact", "any_of",
  "regex_absent",
]);
