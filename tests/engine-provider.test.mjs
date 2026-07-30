/**
 * Ollama adapter contract (ADR-0001 Layer 2).
 *
 * Runs WITHOUT ollama: it asserts the layering and the request shape, not the
 * model. The compliance rule ADR-0001 states is concrete — removing this adapter
 * must not break retrieval, ranking or the benchmark.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_OLLAMA, OllamaProvider } from "../engine/providers/ollama.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("no core module references a provider by name", () => {
  // Doc comments explaining the layering rule are allowed; code is not.
  for (const f of readdirSync(join(ROOT, "engine/core")).filter((x) => x.endsWith(".ts"))) {
    const code = readFileSync(join(ROOT, "engine/core", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.ok(!/ollama/i.test(code), `engine/core/${f} references ollama in code`);
  }
});

test("the adapter knows nothing about the experiment", () => {
  const src = readFileSync(join(ROOT, "engine/providers/ollama.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const term of ["arm", "retriev", "ranking", "benchmark", "taskSet", "evaluation"]) {
    assert.ok(!new RegExp(term, "i").test(src), `the adapter references ${term}`);
  }
});

test("the adapter sets only the constants the experiment holds", async () => {
  // Any extra option would be an uncontrolled variable applied to every arm.
  const p = new OllamaProvider({ host: "http://127.0.0.1:1", maxRetries: 0, timeoutMs: 50 });
  await p.generate({ system: "s", user: "u", temperature: 0, maxTokens: 16, seed: 7 })
    .then(() => assert.fail("unreachable host should have thrown"), () => {});
  assert.equal(p.sent.length, 1, "the request was not recorded");
  assert.deepEqual(Object.keys(p.sent[0].options).sort(), ["num_predict", "seed", "temperature"]);
  assert.equal(p.sent[0].systemChars, 1);
  assert.equal(p.sent[0].userChars, 1);
});

test("transport failures are recorded, never swallowed", async () => {
  const p = new OllamaProvider({ host: "http://127.0.0.1:1", maxRetries: 1, timeoutMs: 50 });
  await assert.rejects(() => p.generate({ system: "s", user: "u", temperature: 0, maxTokens: 8 }));
  assert.equal(p.failures.length, 2, "both attempts must be recorded");
  assert.ok(p.failures.every((f) => f.kind === "transport" || f.kind === "timeout"));
});

test("the default model and timeouts are explicit, not implicit", () => {
  assert.ok(DEFAULT_OLLAMA.model.length > 0);
  assert.ok(DEFAULT_OLLAMA.timeoutMs > 0, "a hung call must not stall the run");
  assert.ok(DEFAULT_OLLAMA.maxRetries >= 0);
});
