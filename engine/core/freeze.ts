/**
 * Freeze gate (ENG-014 §14).
 *
 * Before the first real H1 run, everything that could change a result has to be
 * pinned, and after the run nothing may be changed BECAUSE of what an arm did.
 * That second rule is the one that needs machinery: it is easy to keep, right up
 * to the moment a result looks disappointing.
 *
 * So the frozen set is written to a manifest with a hash, and `verifyFreeze()`
 * recomputes it. A run whose manifest does not match the code and data it ran
 * against is not interpretable, and says so rather than producing a table.
 *
 * This is the same mechanism as `evaluation_hash` in ENG-008 §6, widened from
 * Layer 2 to everything the ticket lists.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const FREEZE_VERSION = "1.0.0";

/** Everything ENG-014 §14 requires to be frozen. */
export interface FreezeManifest {
  freezeVersion: string;
  /** ISO timestamp, supplied by the caller — the core has no clock of its own. */
  frozenAt: string;
  taskSetVersion: string;
  groundTruthVersion: string;
  datasetHash: string;
  /** Content hashes of the files that define the measurement. */
  files: Record<string, string>;
  /** Code versions of the modules that decide a verdict. */
  versions: {
    checks: string;
    evaluator: string;
    eligibility: string;
    reviewProtocol: string;
    fieldSplit: string;
    matching: string;
    ranking: string;
    formulation: string;
  };
  /** Model configuration held constant across arms. */
  model: {
    provider: string;
    model: string;
    modelVersion: string;
    temperature: number;
    maxTokens: number;
    seed?: number;
  };
  /** Arm definitions, so a later redefinition is detectable. */
  arms: string[];
  systemWrapperHash: string;
  /** Hash over everything above. */
  manifestHash: string;
}

export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function hashObject(o: unknown): string {
  return createHash("sha256").update(JSON.stringify(o)).digest("hex");
}

/** Compute the manifest hash over every field except the hash itself. */
export function computeManifestHash(m: Omit<FreezeManifest, "manifestHash">): string {
  return hashObject(m);
}

export function seal(m: Omit<FreezeManifest, "manifestHash">): FreezeManifest {
  return { ...m, manifestHash: computeManifestHash(m) };
}

export interface FreezeCheck {
  ok: boolean;
  problems: string[];
}

/**
 * Verify a manifest against the current state of the repository.
 *
 * `currentFiles` and `currentVersions` are passed in rather than read here, so
 * the core stays provider- and path-neutral and the test can drive it.
 */
export function verifyFreeze(
  m: FreezeManifest,
  currentFiles: Record<string, string>,
  currentVersions: FreezeManifest["versions"],
): FreezeCheck {
  const problems: string[] = [];

  // Recompute over exactly the shape `seal()` hashed: every field but the hash.
  const { manifestHash, ...sealed } = m;
  if (computeManifestHash(sealed) !== manifestHash) {
    problems.push("manifest hash does not match its own contents — the manifest was edited");
  }

  for (const [file, hash] of Object.entries(m.files)) {
    const now = currentFiles[file];
    if (now === undefined) problems.push(`${file}: frozen but no longer present`);
    else if (now !== hash) problems.push(`${file}: changed since the freeze`);
  }
  for (const file of Object.keys(currentFiles)) {
    if (!(file in m.files)) problems.push(`${file}: present but not covered by the freeze`);
  }

  for (const [k, v] of Object.entries(m.versions)) {
    const now = (currentVersions as Record<string, string>)[k];
    if (now !== v) problems.push(`${k} version changed since the freeze: ${v} -> ${now}`);
  }

  return { ok: problems.length === 0, problems };
}
