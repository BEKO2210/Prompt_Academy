/**
 * Evaluator consistency metatests (ENG-014 §12).
 *
 * These do not test that the evaluator gives good marks. They test that it
 * cannot give MEANINGLESS ones — the failure mode that produced a metric which
 * was zero for every arm on every task, and would have been reported as "no
 * difference between arms".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluate, combineVerdicts, EVALUATOR_VERSION } from "../engine/core/evaluator.ts";
import { DETERMINISTIC_KINDS, CHECKS_VERSION, runCheck } from "../engine/core/checks.ts";
import { loadEvaluation, validateEvaluationSet } from "../engine/core/evaluation.ts";
import { loadTasksForAssembly } from "../engine/core/taskset.ts";
import { assessEligibility, summarise } from "../engine/core/eligibility.ts";
import {
  FORBIDDEN_PACKET_FIELDS,
  applyReviewResults,
  buildReviewPackets,
} from "../engine/core/humanReview.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const taskSet = loadTasksForAssembly(join(ROOT, "benchmarks/tasks/v1/tasks.json"));
const evalSet = loadEvaluation(join(ROOT, "benchmarks/tasks/v1/evaluation.json"));

// --- missing measurement is not failure ----------------------------------

test("a task with no deterministic check is not_applicable, never a failure", () => {
  // The core of ENG-014 §6. Scoring absent measurement as failure depresses
  // every arm equally and disguises a hole in the instrument as a finding.
  const r = evaluate("anything", {
    assertions: [{ id: "h1", kind: "human", value: "someone must look at this" }],
    forbidden: [], required_artifacts: [], notes: "",
  });
  assert.equal(r.deterministicVerdict, "not_applicable");
  assert.notEqual(r.independentTaskSuccess, "fail");
  assert.equal(r.deterministic.rate, null, "an absent dimension must be null, not 0");
});

test("an unjudged human check is pending, never a failure", () => {
  const r = evaluate("<form></form>", {
    assertions: [
      { id: "d1", kind: "element", value: "form" },
      { id: "h1", kind: "human", value: "the layout reads clearly" },
    ],
    forbidden: [], required_artifacts: [], notes: "",
  });
  assert.equal(r.deterministicVerdict, "pass");
  assert.equal(r.humanVerdict, "pending");
  assert.equal(r.independentTaskSuccess, "pending");
});

test("a human verdict supplied from outside is honoured", () => {
  const ev = {
    assertions: [{ id: "h1", kind: "human", value: "reads clearly" }],
    forbidden: [], required_artifacts: [], notes: "",
  };
  assert.equal(evaluate("x", ev, { h1: "pass" }).independentTaskSuccess, "pass");
  assert.equal(evaluate("x", ev, { h1: "fail" }).independentTaskSuccess, "fail");
});

test("the combination rule is frozen and arm-independent", () => {
  // A failure anywhere outranks a pending elsewhere, so a broken output is not
  // parked awaiting a human.
  assert.equal(combineVerdicts("fail", "pending"), "fail");
  assert.equal(combineVerdicts("pass", "fail"), "fail");
  assert.equal(combineVerdicts("pass", "pending"), "pending");
  assert.equal(combineVerdicts("pass", "not_applicable"), "pass");
  assert.equal(combineVerdicts("not_applicable", "pass"), "pass");
  assert.equal(combineVerdicts("not_applicable", "not_applicable"), "not_applicable");
  assert.equal(combineVerdicts.length, 2, "the rule must not gain an arm parameter");
});

// --- ground truth consistency --------------------------------------------

test("no task contains logically contradictory requirements", () => {
  // T002 required type="password" AND forbade "password": unpassable in every
  // arm, invisible in a cross-arm table.
  for (const t of taskSet.tasks) {
    const ev = evalSet.evaluations[t.task_id];
    const ABSENCE = new Set(["absent", "regex_absent", "import_absent"]);
    for (const f of ev.forbidden ?? []) {
      const fl = f.toLowerCase();
      for (const a of ev.assertions ?? []) {
        // An absence check naming the same string agrees with `forbidden`.
        if (ABSENCE.has(a.kind)) continue;
        assert.ok(
          !a.value.toLowerCase().includes(fl),
          `${t.task_id}: forbidden "${f}" is required by ${a.id}`,
        );
      }
      assert.ok(
        !t.request.toLowerCase().includes(fl),
        `${t.task_id}: forbidden "${f}" appears in the request itself`,
      );
    }
  }
});

test("every check carries an audit class", () => {
  const audit = JSON.parse(readFileSync(join(ROOT, "benchmarks/tasks/v1/check-audit.json"), "utf8"));
  assert.ok(audit.checks.length > 190, `audit covers only ${audit.checks.length} checks`);
  for (const t of taskSet.tasks) {
    for (const a of evalSet.evaluations[t.task_id].assertions ?? []) {
      assert.ok(["A", "B", "C", "D"].includes(a.cls), `${t.task_id}.${a.id} has no audit class`);
    }
  }
});

test("no deterministic check silently replaced a subjective criterion", () => {
  // Scheinautomatisierung guard: a criterion that is about appearance must not
  // have been converted into a pattern match. Those phrases may only appear on
  // checks that are still `human`.
  const SUBJECTIVE = /visual|polished|legible|clearly distinguished|aesthetic|beautiful|looks /i;
  for (const t of taskSet.tasks) {
    for (const a of evalSet.evaluations[t.task_id].assertions ?? []) {
      if (DETERMINISTIC_KINDS.has(a.kind)) {
        assert.ok(!SUBJECTIVE.test(a.value), `${t.task_id}.${a.id} automates a subjective phrase`);
      }
    }
  }
});

test("every task has at least one evaluable check", () => {
  for (const t of taskSet.tasks) {
    const ev = evalSet.evaluations[t.task_id];
    const n = (ev.assertions ?? []).length + (ev.forbidden ?? []).length;
    assert.ok(n > 0, `${t.task_id} has nothing to evaluate at all`);
  }
});

test("evaluation is deterministic", () => {
  const ev = evalSet.evaluations.T002;
  const out = '<form><input type="email"/><input type="password"/></form>';
  assert.deepEqual(evaluate(out, ev), evaluate(out, ev));
});

test("a broken pattern in Layer 2 is unresolved, not a model failure", () => {
  const r = runCheck("anything", { id: "bad", kind: "regex", value: "([unclosed" });
  assert.equal(r.status, "unresolved", "a harness typo must not be blamed on the model");
});

// --- the evaluator cannot see the arm ------------------------------------

test("the evaluator cannot see the arm, the model or the record", () => {
  // Arity is 2 because the third parameter has a default; what matters is the
  // SHAPE of the signature, so the parameter list is checked directly.
  const src = readFileSync(join(ROOT, "engine/core/evaluator.ts"), "utf8");
  const sig = src.match(/export function evaluate\(([\s\S]*?)\)/)[1];
  const params = sig.split(",").map((p) => p.trim().split(":")[0].trim()).filter(Boolean);
  assert.deepEqual(params, ["output", "ev", "human"], `evaluate() signature changed: ${params}`);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(
    !/from ["'][^"']*(arms|retrieval|runner)/.test(code),
    "the evaluator imports arm or retrieval state",
  );
});

test("a human review packet cannot carry the arm, model or record", () => {
  const bundle = buildReviewPackets(
    [
      { taskId: "T001", arm: "A", runIndex: 0, request: "r", output: "o", evaluation: evalSet.evaluations.T001 },
      { taskId: "T001", arm: "D", runIndex: 0, request: "r", output: "o2", evaluation: evalSet.evaluations.T001 },
    ],
    99,
  );
  for (const p of bundle.packets) {
    const serialised = JSON.stringify(p).toLowerCase();
    for (const f of FORBIDDEN_PACKET_FIELDS) {
      assert.ok(!(f.toLowerCase() in p), `packet exposes ${f}`);
      assert.ok(!serialised.includes(`"${f.toLowerCase()}"`), `packet serialises ${f}`);
    }
  }
  // The key exists, but only on the harness side.
  assert.equal(bundle.keys.length, 2);
  assert.ok(bundle.keys.some((k) => k.arm === "D"));
});

test("packet ids carry no information about the arm", () => {
  const items = ["A", "B", "C", "D", "E"].map((arm) => ({
    taskId: "T001", arm, runIndex: 0, request: "r", output: `out-${arm}`,
    evaluation: evalSet.evaluations.T001,
  }));
  const a = buildReviewPackets(items, 1);
  const b = buildReviewPackets(items, 2);
  const armOf = (bundle, id) => bundle.keys.find((k) => k.packetId === id).arm;
  const sameMapping = a.packets.every((p) => armOf(a, p.packetId) === armOf(b, p.packetId));
  assert.ok(!sameMapping, "packet id -> arm mapping is stable across seeds");
});

test("review results reattach to the right arm", () => {
  const items = ["A", "D"].map((arm) => ({
    taskId: "T007", arm, runIndex: 0, request: "r", output: `o-${arm}`,
    evaluation: evalSet.evaluations.T007,
  }));
  const bundle = buildReviewPackets(items, 5);
  const target = bundle.keys.find((k) => k.arm === "D");
  const applied = applyReviewResults(bundle, { [target.packetId]: { a3: "pass" } });
  assert.equal(applied.length, 1);
  assert.equal(applied[0].arm, "D");
  assert.deepEqual(applied[0].verdicts, { a3: "pass" });
});

test("every arm is judged against the same rubric text", () => {
  const items = ["A", "B", "C", "D", "E"].map((arm) => ({
    taskId: "T007", arm, runIndex: 0, request: "r", output: "o",
    evaluation: evalSet.evaluations.T007,
  }));
  const bundle = buildReviewPackets(items, 3);
  const rubrics = new Set(bundle.packets.map((p) => JSON.stringify(p.criteria)));
  assert.equal(rubrics.size, 1, "arms received different criteria");
});

// --- eligibility ----------------------------------------------------------

test("eligibility excludes, and names why, without deleting anything", () => {
  const rows = assessEligibility({
    tasks: taskSet.tasks,
    evaluations: evalSet,
    unretrieved: ["T017", "T021", "T027"],
  });
  assert.equal(rows.length, taskSet.tasks.length, "a task vanished from the assessment");
  const s = summarise(rows);
  assert.equal(s.byReason.no_retrieval, 3);
  assert.equal(s.byReason.language_gap_diagnostic, 3, "the German gap must stay visible as such");
  assert.ok(!s.byReason.contradictory_ground_truth, "a contradictory task survived");
  assert.equal(s.eligible, taskSet.tasks.length - 3);
});

test("versions exist so the freeze gate has something to freeze", () => {
  assert.match(EVALUATOR_VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(CHECKS_VERSION, /^\d+\.\d+\.\d+$/);
});

// --- sensitivity: a check that never passes is as useless as one that always does

/**
 * Hand-written outputs that a competent answer would plausibly look like.
 *
 * They are NOT model output and prove nothing about any model. They exist to
 * measure the instrument's FALSE NEGATIVE rate: a deterministic check that fails
 * on a good answer scores every arm down equally and hides real differences.
 *
 * This measurement already paid for itself twice:
 *   - the artifact check rejected a valid YAML workflow, because its "looks like
 *     code" precondition was JS-shaped
 *   - `count_min 6::<input` rejected six inputs rendered by a map, which occur
 *     once in the source
 */
const PLAUSIBLE_GOOD = {
  T007: `export function Modal({open,onClose,triggerRef}){
  const ref=useRef(null);
  useEffect(()=>{ if(open){ ref.current?.focus(); }
    return ()=>{ triggerRef.current?.focus(); }; },[open]);
  const onKeyDown=(e)=>{ if(e.key==="Escape") onClose();
    if(e.key==="Tab"){ /* focus trap */ } };
  return <div role="dialog" aria-modal="true" ref={ref} onKeyDown={onKeyDown}>x</div>; }`,
  T045: `export function Field({id,error}){ return (<div>
  <label htmlFor={id}>Email</label>
  <input id={id} aria-invalid={!!error} aria-describedby={id+"-err"} />
  <p id={id+"-err"} role="alert">{error}</p></div>); }`,
  T048: `name: CI
on: { push: { branches: [main] } }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
  deploy:
    needs: test
    if: github.ref == "refs/heads/main"
    steps:
      - run: npm run deploy`,
  T050: `app.get("/healthz",(req,res)=>res.status(200).send("ok"));
app.get("/readyz", async (req,res)=>{ try{ await pool.query("SELECT 1");
  res.status(200).send("ready"); }catch(e){ res.status(503).send("unhealthy"); }});
export default app;`,
  T017: `export function CodeInput(){ const refs=[...Array(6)].map(()=>useRef());
  const onPaste=(e)=>{ const v=e.clipboardData.getData("text").slice(0,6); };
  const onKeyDown=(e,i)=>{ if(e.key==="Backspace"&&!e.target.value) refs[i-1]?.current?.focus(); };
  return <div>{[0,1,2,3,4,5].map(i=><input key={i} ref={refs[i]} onPaste={onPaste} onKeyDown={e=>onKeyDown(e,i)}/>)}</div>; }`,
};

test("deterministic checks do not reject plausibly correct answers", () => {
  let pass = 0, fail = 0;
  const failures = [];
  for (const [tid, output] of Object.entries(PLAUSIBLE_GOOD)) {
    const r = evaluate(output, evalSet.evaluations[tid]);
    for (const c of r.checks) {
      if (c.status === "pass") pass++;
      else if (c.status === "fail") { fail++; failures.push(`${tid}.${c.id}(${c.kind})`); }
    }
  }
  const rate = fail / (pass + fail);
  assert.ok(rate <= 0.05, `false-negative rate ${(rate * 100).toFixed(0)}%: ${failures.join(" ")}`);
});

test("deterministic checks do reject an answer that is not one", () => {
  // The other half of sensitivity. A check set that passes everything measures
  // nothing either.
  const junk = "I would build this using modern best practices and a clean design.";
  let failed = 0;
  for (const tid of Object.keys(PLAUSIBLE_GOOD)) {
    const r = evaluate(junk, evalSet.evaluations[tid]);
    if (r.deterministicVerdict === "fail") failed++;
  }
  assert.equal(failed, Object.keys(PLAUSIBLE_GOOD).length, "prose passed the deterministic checks");
});

test("a context-blind output scores identically in every arm", () => {
  // Not about arms directly — it pins that the evaluator's verdict is a function
  // of (output, Layer 2) alone. Same output, five notional arms, one verdict.
  const ev = evalSet.evaluations.T007;
  const verdicts = new Set(
    ["A", "B", "C", "D", "E"].map(() => JSON.stringify(evaluate(PLAUSIBLE_GOOD.T007, ev))),
  );
  assert.equal(verdicts.size, 1);
});

// --- freeze gate (ENG-014 §14) -------------------------------------------

test("the freeze manifest detects a changed file, version or manifest", async () => {
  const { seal, verifyFreeze } = await import("../engine/core/freeze.ts");
  const base = {
    freezeVersion: "1.0.0",
    frozenAt: "2026-07-30T00:00:00.000Z",
    taskSetVersion: "task-set-v1",
    groundTruthVersion: "task-set-v1-eval2",
    datasetHash: "abc",
    files: { "benchmarks/tasks/v1/tasks.json": "h1", "benchmarks/tasks/v1/evaluation.json": "h2" },
    versions: {
      checks: "1.0.0", evaluator: "2.0.0", eligibility: "1.0.0", reviewProtocol: "1.0.0",
      fieldSplit: "1.0.0", matching: "1.1.0", ranking: "1.0.0", formulation: "1.1.0",
    },
    model: { provider: "stub", model: "stub", modelVersion: "stub-1", temperature: 0, maxTokens: 2048 },
    arms: ["A", "B", "C", "D", "E"],
    systemWrapperHash: "wrap",
  };
  const m = seal(base);
  const files = { ...base.files };

  assert.deepEqual(verifyFreeze(m, files, base.versions), { ok: true, problems: [] });

  // A changed ground-truth file after the freeze.
  const changed = verifyFreeze(m, { ...files, "benchmarks/tasks/v1/evaluation.json": "DIFFERENT" }, base.versions);
  assert.ok(!changed.ok && changed.problems.some((p) => /changed since the freeze/.test(p)));

  // A bumped evaluator — the case where a disappointing arm tempts a tweak.
  const bumped = verifyFreeze(m, files, { ...base.versions, evaluator: "2.1.0" });
  assert.ok(!bumped.ok && bumped.problems.some((p) => /evaluator version changed/.test(p)));

  // A hand-edited manifest.
  const edited = verifyFreeze({ ...m, taskSetVersion: "task-set-v2" }, files, base.versions);
  assert.ok(!edited.ok && edited.problems.some((p) => /manifest was edited/.test(p)));

  // A new file that the freeze does not cover.
  const extra = verifyFreeze(m, { ...files, "benchmarks/tasks/v1/extra.json": "x" }, base.versions);
  assert.ok(!extra.ok && extra.problems.some((p) => /not covered by the freeze/.test(p)));
});

// --- no Scheinautomatisierung (ENG-014 §2) -------------------------------

test("a proxy check never stands in for the criterion it narrowed", () => {
  // 43 class-B checks settle a NECESSARY structural condition but not the whole
  // criterion: "focus is moved into the modal AND restored to the trigger on
  // close" becomes a pattern for a focus call, which cannot see the restore.
  // Each of those keeps a human residual carrying the full criterion, so the
  // automated form supplements the judgement and never replaces it.
  let proxies = 0;
  for (const t of taskSet.tasks) {
    const as = evalSet.evaluations[t.task_id].assertions ?? [];
    for (const a of as.filter((x) => x.proxy)) {
      proxies++;
      const residual = as.find((x) => x.residual_of === a.id);
      assert.ok(residual, `${t.task_id}.${a.id} is a proxy with no human residual`);
      assert.equal(residual.kind, "human");
      assert.equal(residual.value, a.criterion, "the residual lost the original criterion");
    }
  }
  assert.ok(proxies > 30, `only ${proxies} proxies found — the annotation was lost`);
});

test("every automated check records the criterion it came from", () => {
  for (const t of taskSet.tasks) {
    for (const a of evalSet.evaluations[t.task_id].assertions ?? []) {
      if (a.cls === "B" && a.kind !== "human" && !a.id.startsWith("art")) {
        assert.ok(a.criterion, `${t.task_id}.${a.id} automates something with no recorded source`);
      }
    }
  }
});

// --- ENG-015: defects the provider pilot exposed --------------------------

test("a complete HTML document counts as a component artifact", async () => {
  // The pilot returned working HTML pages that the artifact check rejected,
  // because it required export/<template>/@Component — an unstated assumption
  // that the answer would use a JavaScript framework. The tasks never said so,
  // and the rejection hit every arm, adding noise rather than signal.
  const { runCheck } = await import("../engine/core/checks.ts");
  const html = '<!DOCTYPE html>\n<html lang="en"><head><style>.t{}</style></head>' +
    '<body><div class="toast"></div><script>function show(){}</script></body></html>';
  assert.equal(runCheck(html, { id: "a", kind: "artifact", value: "component" }).status, "pass");
  // And prose still fails.
  assert.equal(
    runCheck("I would build this with a clean design.", { id: "a", kind: "artifact", value: "component" }).status,
    "fail",
  );
});

test("a prohibition is tested as a violation, not as a requirement", async () => {
  // "Secrets are referenced, never written into the file" was automated as a
  // pattern that had to be PRESENT, so an answer containing no secret at all —
  // which commits no violation — was failed.
  const { runCheck } = await import("../engine/core/checks.ts");
  const spec = { id: "a", kind: "regex_absent", value: "(sk_live|AKIA[0-9A-Z]{8})" };
  assert.equal(runCheck('const key = process.env.STRIPE_KEY', spec).status, "pass");
  assert.equal(runCheck('const key = "sk_live_abc123"', spec).status, "fail");
  assert.equal(runCheck("nothing relevant here", spec).status, "pass", "no violation must pass");
});

test("an absence check may name the same string as `forbidden`", () => {
  // The contradiction detector fired on T049 because a regex_absent pattern
  // legitimately names the strings `forbidden` also lists. For an absence check
  // that overlap is agreement.
  const problems = validateEvaluationSet(
    { version: "x", evaluations: { TX: {
      assertions: [{ id: "a1", kind: "regex_absent", value: "sk_live" }],
      forbidden: ["sk_live"], required_artifacts: [], notes: "",
    } } },
    ["TX"],
    { TX: "write a config" },
  );
  assert.deepEqual(problems, [], problems.join("; "));
});

test("every comma-coordinated compound criterion has a human residual", () => {
  // The first residual pass only looked for "and"/"only"/... and missed clauses
  // joined by a comma ("Secrets are referenced, never written into the file").
  for (const t of taskSet.tasks) {
    const as = evalSet.evaluations[t.task_id].assertions ?? [];
    const residuals = new Set(as.map((a) => a.residual_of).filter(Boolean));
    for (const a of as) {
      if (a.kind === "human" || !a.criterion) continue;
      if (/,| and | or /i.test(a.criterion)) {
        assert.ok(residuals.has(a.id), `${t.task_id}.${a.id} is compound with no human residual`);
      }
    }
  }
});
