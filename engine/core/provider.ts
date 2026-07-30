/**
 * The provider interface (ADR-0001, ADR-0005).
 *
 * "Ollama is the first provider. Ollama is not the architecture." This file is
 * where that is enforced: the core depends on this INTERFACE and never on a
 * provider. The compliance test in ADR-0001 is concrete — the core library and
 * its tests must run with a stub provider and no ollama installed. If deleting
 * the ollama adapter breaks retrieval, ranking or the benchmark, the layering
 * has been violated.
 *
 * Which is why the stub lives here, in the core, and not in a test fixture: the
 * core must be runnable on its own terms.
 */

export interface GenerateRequest {
  system: string;
  user: string;
  /** §4 constant. Identical across arms or the comparison is void. */
  temperature: number;
  /** §4 constant. Identical across arms — arms must not differ in room to answer. */
  maxTokens: number;
  /** Where supported. Recorded either way (§6). */
  seed?: number;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** Milliseconds. Machine-dependent; must be labelled as such when reported. */
  latencyMs: number;
}

export interface ProviderInfo {
  /** e.g. "ollama", "stub". Recorded per run (§6). */
  provider: string;
  /** e.g. "qwen3:8b". Recorded per run. */
  model: string;
  /**
   * Resolved model version/digest. A change mid-run is a HARD STOP (§7) — the
   * run is discarded, not annotated. This field is how that is detected.
   */
  modelVersion: string;
}

export interface Provider {
  info(): Promise<ProviderInfo>;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

/**
 * A provider that calls nothing.
 *
 * It is deterministic on purpose: the same request always yields the same text,
 * so harness tests assert on harness behaviour rather than on model behaviour.
 * Its output is deliberately useless as an artifact — it echoes a fingerprint of
 * the request. A stub that produced plausible code would let a broken harness
 * look like it was working.
 */
export class StubProvider implements Provider {
  #calls = 0;

  async info(): Promise<ProviderInfo> {
    return { provider: "stub", model: "stub", modelVersion: "stub-1" };
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.#calls++;
    // Echoing the request length, not the request, so a stub run cannot be
    // mistaken for a real one and cannot accidentally satisfy a content check.
    const text =
      `STUB OUTPUT — no model was called.\n` +
      `system_len=${req.system.length} user_len=${req.user.length} ` +
      `temperature=${req.temperature} max_tokens=${req.maxTokens}`;
    return {
      text,
      inputTokens: Math.ceil((req.system.length + req.user.length) / 4),
      outputTokens: Math.ceil(text.length / 4),
      latencyMs: 0,
    };
  }

  get callCount(): number {
    return this.#calls;
  }
}
