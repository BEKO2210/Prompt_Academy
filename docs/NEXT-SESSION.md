# Where we stopped — resume here

Stopped mid-run on purpose: the GPU fan was too loud at night. Nothing is broken
and nothing is half-written. The interrupted run wrote no output file, so there
is no partial result to distrust.

## The one command to start with

```bash
cd ~/Schreibtisch/GitHub-Repos/Prompt_Academy
node engine/cli/embed-corpus.mjs            # 55 s — the index is gitignored
node engine/cli/run-pilot.mjs --split dev_clean --arms A,B,C,D,E_concat --n 3 \
     --retrieval semantic --out reports/dev-clean-semantic.json
```

~37 minutes, 300 calls, GPU at ~94% the whole time — **do not start this late in
the evening.**

## What that run answers

The lexical benchmark is already done (`reports/dev-clean-run.json`): every arm
that injected a retrieved record scored BELOW the arm with no context at all.

    A no context  0.918   |  D 0.754  |  B 0.719  |  E_concat 0.649  |  C 0.645

Then retrieval was measured directly and found to be the cause: only 2 of 20
top-1 records were relevant, 9 were topically unrelated.

Semantic retrieval (nomic-embed-text, already installed) fixed most of that:

    RELEVANT 2 -> 10   |   usable 45% -> 75%   |   empty 2 -> 0

**The open question is exactly one thing:** with retrieval fixed, does injecting
a skill still lose to injecting nothing?

- If context arms now beat A -> the skill-engine idea works and the earlier
  result was a retrieval artifact.
- If A still wins -> the idea does not survive its own best case, and that is
  the answer to the original question.

Either way it is a real answer, and it costs 37 minutes.

## Frozen and not to be touched

- HOLDOUT: 20 tasks, never measured. Not by retrieval, not by a model, not by a
  human, not by prompt inspection.
- `docs/h1-decision-rules.md`: the six decision cases and the effect thresholds,
  written before any comparison.
- `benchmarks/tasks/v1/freeze-manifest.json`: verify before the run with the
  snippet in reports/eng-017-pre-h1-gate.md. **It will report `formulation`,
  `retrieval` and the new semantic module as changed — that is correct and
  expected.** Re-seal with `node engine/cli/seal-freeze.mjs` and record that the
  change was made because retrieval was measured broken against its own purpose,
  not because an arm looked bad.

## Still open, in order of value

1. The semantic run above.
2. Human pass on the clean-DEV outputs (~300 propositions). The primary metric
   stays `pending` until then; everything reported so far is the pre-registered
   secondary metric.
3. Two lexical repairs were tried and rejected on measurement (see ENG-020).
   Do not retry them without new evidence.
