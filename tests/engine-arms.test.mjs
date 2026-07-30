/**
 * H1 experiment harness — structural guarantees (ENG-008 §2, §3, §4, §7).
 *
 * These tests are not about output quality. They are about the properties that
 * decide whether ANY number the harness later produces means anything:
 *
 *   - Layer 2 never reaches a prompt          (else arm D wins by construction)
 *   - B, C and D share one retrieved record   (else a B/D gap is a record gap)
 *   - B = C ∪ D                               (else the split loses or duplicates)
 *   - §4 constants hold across arms           (else arms are incomparable)
 *   - the core runs with no provider           (ADR-0001 layering)
 *
 * ENG-008 §7 calls violations of the first four HARD STOPS, not warnings: a
 * violating run produces numbers that look valid and are not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARMS,
  SYSTEM_WRAPPER,
  buildPrompt,
} from "../engine/core/arms.ts";
import {
  ACTIONABLE_FIELDS,
  DESCRIPTIVE_FIELDS,
  FIELD_SPLIT_VERSION,
  INJECTABLE_FIELDS,
  actionableContext,
  descriptiveContext,
  fullInjectableContext,
  renderContext,
} from "../engine/core/fieldSplit.ts";
import {
  evaluationStrings,
  loadEvaluation,
  validateEvaluationSet,
} from "../engine/core/evaluation.ts";
import { loadTasksForAssembly, validateTaskSet } from "../engine/core/taskset.ts";
import { StubProvider } from "../engine/core/provider.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TASKS = join(ROOT, "benchmarks/tasks/v1/tasks.json");
const EVALS = join(ROOT, "benchmarks/tasks/v1/evaluation.json");

const taskSet = loadTasksForAssembly(TASKS);
const evalSet = loadEvaluation(EVALS);

/** A record with content in every injectable field, so nothing is silently skipped. */
const RECORD = {
  id: "PRM-TEST-1",
  prompt: "Build a pricing section with a billing period toggle.",
  style: { visual_style: "minimal", layout_style: "three column" },
  acceptance_criteria: ["Toggle switches all prices", "Highlighted tier is visually distinct"],
  negative_prompt: "no placeholder text no broken layout",
  tech_stack: { framework: "React", styling: "Tailwind CSS" },
  // Fields that must reach NO arm:
  title: "Pricing Section With Toggle",
  slug: "pricing-section-toggle",
  tags: ["pricing", "saas"],
  quality: { specificity_score: 10 },
  batch: "test_001",
  created_by_agent: "test_agent",
  website_card: { headline: "Pricing", summary: "A pricing section." },
};

const SECOND_RECORD = {
  id: "PRM-TEST-2",
  prompt: "Another pricing layout.",
  style: { visual_style: "bold" },
  acceptance_criteria: ["Toggle switches all prices", "Annual pricing shows the saving"],
  negative_prompt: "no unstyled elements",
  tech_stack: { framework: "React" },
};

const task = taskSet.tasks[0];

// --- §2 leakage -----------------------------------------------------------

test("the task file does not contain the evaluation layer", () => {
  const problems = validateTaskSet(TASKS);
  assert.deepEqual(problems, [], problems.join("; "));
});

test("every task is gradeable and no evaluation is orphaned", () => {
  const problems = validateEvaluationSet(
    evalSet,
    taskSet.tasks.map((t) => t.task_id),
    Object.fromEntries(taskSet.tasks.map((t) => [t.task_id, t.request])),
  );
  assert.deepEqual(problems, [], problems.join("; "));
});

test("a Layer 2 sentinel appears in no assembled prompt, for any arm", () => {
  // The canonical leakage test from ENG-008 §Tests. If this ever passes by
  // accident, the experiment is decoration.
  const SENTINEL = "ZZQX-LAYER2-SENTINEL-9174";
  const poisoned = {
    assertions: [{ id: "s1", kind: "contains", value: SENTINEL }],
    forbidden: [SENTINEL],
    required_artifacts: [SENTINEL],
    notes: SENTINEL,
  };
  assert.ok(evaluationStrings(poisoned).includes(SENTINEL));

  // The realistic leak is not that someone writes `prompt += evaluation`. It is
  // that a task object still CARRYING its evaluation reaches assembly — because
  // the loader stopped stripping it, or a caller bypassed the loader — and then
  // something stringifies the task. So the fixture is poisoned the same way:
  // an evaluation hanging off the task, and off the record, and the assertion is
  // that neither survives into any prompt.
  const poisonedTask = { ...task, evaluation: poisoned };
  const poisonedRecord = { ...RECORD, evaluation: poisoned, notes: SENTINEL };

  for (const arm of ARMS) {
    const p = buildPrompt(arm, poisonedTask, poisonedRecord, [SECOND_RECORD]);
    assert.ok(!p.system.includes(SENTINEL), `arm ${arm}: sentinel in system prompt`);
    assert.ok(!p.user.includes(SENTINEL), `arm ${arm}: sentinel in user prompt`);
  }
});

test("no real Layer 2 string reaches the injected context either", () => {
  // The sentinel proves the path is clean for a value that exists nowhere else.
  // This proves it for the strings actually in use — the case where an
  // accidental JSON.stringify would show up.
  //
  // Scoped to the INJECTED portion, not the whole prompt. Leakage is Layer 2
  // text arriving via the retrieved record; a phrase the user themselves wrote
  // is not leakage however much it resembles the grader. T008 is the concrete
  // case: the request asks for a settings page and `required_artifacts` says
  // "a settings page". That is convergent authoring (§2), and a test that
  // flagged it would be testing the English language, not the code path.
  for (const t of taskSet.tasks) {
    const ev = evalSet.evaluations[t.task_id];
    const strings = evaluationStrings(ev)
      .filter((s) => s.length > 12)
      .filter((s) => !t.request.toLowerCase().includes(s.toLowerCase()));
    for (const arm of ARMS) {
      const p = buildPrompt(arm, t, RECORD, [SECOND_RECORD]);
      const injected = p.user.replace(t.request, "");
      for (const s of strings) {
        assert.ok(
          !injected.includes(s),
          `arm ${arm}, ${t.task_id}: Layer 2 string in injected context: ${s}`,
        );
      }
    }
  }
});

test("the assembly path cannot import the evaluation module", () => {
  // Structural, not conventional (§2). A comment saying "don't read this"
  // survives exactly until someone writes JSON.stringify(task).
  for (const f of ["engine/core/arms.ts", "engine/core/fieldSplit.ts", "engine/core/taskset.ts"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(
      !/(import|require)\s*\(?\s*["'][^"']*evaluation/.test(code),
      `${f} imports the evaluation module — Layer 2 must not be reachable from assembly`,
    );
    // A file READ, not a mention. taskset.ts names evaluation.json inside a
    // validation error message ("evaluation must live in evaluation.json"),
    // which is the opposite of reading it — flagging that would punish the code
    // for documenting the rule it enforces.
    assert.ok(
      !/read\w*\s*\([^)]*evaluation/i.test(code),
      `${f} reads the evaluation file`,
    );
  }
});

test("assembly cannot see an evaluation key even if the task file grows one", () => {
  const loaded = loadTasksForAssembly(TASKS);
  for (const t of loaded.tasks) {
    assert.ok(!("evaluation" in t), `${t.task_id}: evaluation survived loading`);
  }
});

// --- §3 arms and the field split -----------------------------------------

test("the field split is versioned and partitions the injectable set", () => {
  assert.match(FIELD_SPLIT_VERSION, /^\d+\.\d+\.\d+$/);
  const overlap = DESCRIPTIVE_FIELDS.filter((f) => ACTIONABLE_FIELDS.includes(f));
  assert.deepEqual(overlap, [], "a field is on both sides of the split");
  assert.deepEqual(
    [...INJECTABLE_FIELDS].sort(),
    [...DESCRIPTIVE_FIELDS, ...ACTIONABLE_FIELDS].sort(),
    "the injectable set is not exactly C plus D",
  );
});

test("B = C union D — nothing lost, nothing duplicated", () => {
  const b = fullInjectableContext(RECORD).sections.map((s) => s.field);
  const c = descriptiveContext(RECORD).sections.map((s) => s.field);
  const d = actionableContext(RECORD).sections.map((s) => s.field);
  assert.deepEqual([...b].sort(), [...c, ...d].sort());
  // And byte-exact on content, so the split cannot quietly reformat.
  const bText = renderContext(fullInjectableContext(RECORD));
  for (const section of [...descriptiveContext(RECORD).sections, ...actionableContext(RECORD).sections]) {
    assert.ok(bText.includes(section.text), `arm B lost the content of ${section.field}`);
  }
});

test("the field split is byte-exact for a fixture record", () => {
  assert.equal(
    renderContext(descriptiveContext(RECORD)),
    "## prompt\nBuild a pricing section with a billing period toggle.\n\n" +
      "## style\n- visual_style: minimal\n- layout_style: three column",
  );
  assert.equal(
    renderContext(actionableContext(RECORD)),
    "## acceptance_criteria\n- Toggle switches all prices\n- Highlighted tier is visually distinct\n\n" +
      "## negative_prompt\nno placeholder text no broken layout\n\n" +
      "## tech_stack\n- framework: React\n- styling: Tailwind CSS",
  );
});

test("no arm injects retrieval keys, provenance or self-reported quality", () => {
  // quality.* is self-reported by the generating agent and not independently
  // validated (AGENTS.md); title/tags/website_card are how the record was FOUND,
  // not instructions for the work.
  const MUST_NOT_APPEAR = [
    "Pricing Section With Toggle", "pricing-section-toggle",
    "specificity_score", "test_001", "test_agent", "A pricing section.",
  ];
  for (const arm of ARMS) {
    const p = buildPrompt(arm, task, RECORD, [SECOND_RECORD]);
    for (const s of MUST_NOT_APPEAR) {
      assert.ok(!p.user.includes(s), `arm ${arm} injected non-injectable content: ${s}`);
    }
  }
});

test("arm A injects nothing at all", () => {
  const a = buildPrompt("A", task, RECORD);
  assert.equal(a.user, task.request, "arm A must be the bare request");
  assert.deepEqual(a.recordIds, [], "arm A must reference no record");
  assert.ok(!a.user.includes("Reference context"));
});

test("arms B, C and D use the identical record", () => {
  // §3 binding. Violated, a B/D difference is a different-record difference and
  // the comparison must be aborted (§7).
  const ids = ["B", "C", "D"].map((arm) => buildPrompt(arm, task, RECORD).recordIds);
  assert.deepEqual(ids[0], ids[1]);
  assert.deepEqual(ids[1], ids[2]);
  assert.deepEqual(ids[0], ["PRM-TEST-1"]);
});

test("arm E deduplicates identical instructions across records", () => {
  const e = buildPrompt("E", task, RECORD, [SECOND_RECORD]);
  const occurrences = e.user.split("Toggle switches all prices").length - 1;
  assert.equal(occurrences, 1, "an instruction present in both records was injected twice");
  assert.ok(e.user.includes("Annual pricing shows the saving"), "arm E dropped a distinct instruction");
  assert.deepEqual(e.recordIds, ["PRM-TEST-1", "PRM-TEST-2"]);
});

test("arm E is documented as concatenation, not compilation", () => {
  // E ≈ D would otherwise be reported as "compilation adds nothing" when what
  // was measured is "concatenation adds nothing" — a much weaker claim.
  const src = readFileSync(join(ROOT, "engine/core/arms.ts"), "utf8");
  assert.match(src, /not a compiler|CONCATENATION/i);
});

// --- §4 constants ---------------------------------------------------------

test("the system wrapper is byte-identical across arms", () => {
  // §4 names this the easiest constant to break and the most damaging.
  const systems = new Set(ARMS.map((arm) => buildPrompt(arm, task, RECORD).system));
  assert.equal(systems.size, 1, "arms received different system prompts");
  assert.equal([...systems][0], SYSTEM_WRAPPER);
});

test("every arm carries the same request text", () => {
  for (const arm of ARMS) {
    const p = buildPrompt(arm, task, RECORD);
    assert.ok(p.user.includes(task.request), `arm ${arm} lost the user's request`);
  }
});

// --- ADR-0001 layering ----------------------------------------------------

test("the core runs with a stub provider and no ollama", () => {
  const src = ["arms.ts", "fieldSplit.ts", "taskset.ts", "evaluation.ts", "provider.ts"]
    .map((f) => readFileSync(join(ROOT, "engine/core", f), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.ok(!/ollama/i.test(src), "the core library references a specific provider");
});

test("the stub provider is deterministic and calls nothing", async () => {
  const p = new StubProvider();
  const req = { system: SYSTEM_WRAPPER, user: "x", temperature: 0, maxTokens: 100 };
  const a = await p.generate(req);
  const b = await p.generate(req);
  assert.equal(a.text, b.text, "stub output varies — harness tests would be unstable");
  assert.match(a.text, /STUB OUTPUT/, "stub output must be unmistakable for a real run");
  assert.equal(p.callCount, 2);
});

test("no task is made unpassable by its own evaluation", () => {
  // Found in the seed set: T002 required type="password" and forbade the string
  // "password". Unpassable in every arm, so it would have depressed all of them
  // equally — invisible in a cross-arm table, and pure noise in the headline
  // metric. The validator now rejects that shape outright; this pins it.
  const p = validateEvaluationSet(
    { version: "x", evaluations: { TX: {
      assertions: [{ id: "a1", kind: "regex", value: 'type="password"' }],
      forbidden: ["password"], required_artifacts: [], notes: "",
    } } },
    ["TX"],
    { TX: "build a login form" },
  );
  assert.ok(p.some((x) => /unpassable/.test(x)), "a self-contradicting evaluation was accepted");
});

test("the task set reached the size the ticket permits", () => {
  // §1 targets 100 and permits 50 as an under-powered first pass.
  assert.ok(taskSet.tasks.length >= 50, `task set is ${taskSet.tasks.length}, below the permitted 50`);
  const langs = new Set(taskSet.tasks.map((t) => t.language));
  assert.deepEqual([...langs].sort(), ["de", "en"], "the task set is not bilingual");
  const de = taskSet.tasks.filter((t) => t.language === "de").length;
  assert.ok(de >= 15 && de <= 35, `German share is ${de}/50 — the mix has drifted`);
  assert.ok(new Set(taskSet.tasks.map((t) => t.domain)).size >= 12, "domain coverage is too narrow");
});

test("no task request was copied from the dataset", () => {
  // §1: requests must be written as a user would write them. A copied request
  // would test memorisation of the corpus rather than task performance.
  const corpusText = readFileSync(join(ROOT, "data/01_landing_pages.jsonl"), "utf8").toLowerCase();
  for (const t of taskSet.tasks) {
    const chunk = t.request.toLowerCase().slice(0, 60);
    assert.ok(!corpusText.includes(chunk), `${t.task_id}: request appears verbatim in the dataset`);
  }
});
