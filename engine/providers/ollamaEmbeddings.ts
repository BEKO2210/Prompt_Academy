/**
 * Local embedding adapter (ADR-0001 Layer 2).
 *
 * Exists because lexical retrieval was measured to fail at the task -> skill
 * step: 45% of top-1 records were topically unrelated, and the cause is a
 * vocabulary mismatch that no amount of term selection can close. A task says
 * "eine Seitenleiste, die auf dem Handy einklappt"; the corpus says "with neon
 * visual aesthetics tailored for the cybersecurity industry". Their word overlap
 * is largely coincidental.
 *
 * Semantic retrieval is the tool for that mismatch. ADR-0003 listed it as arm R7
 * and deferred it; the measurement is what promotes it now, not the original
 * vision.
 *
 * Knows nothing about retrieval, ranking, arms or benchmarks — same layering
 * rule as the generation adapter.
 */
export interface EmbeddingConfig {
  host: string;
  model: string;
  timeoutMs: number;
}

export const DEFAULT_EMBEDDINGS: EmbeddingConfig = {
  host: "http://127.0.0.1:11434",
  model: "nomic-embed-text:latest",
  timeoutMs: 120_000,
};

export class OllamaEmbeddings {
  readonly cfg: EmbeddingConfig;
  #calls = 0;

  constructor(cfg: Partial<EmbeddingConfig> = {}) {
    this.cfg = { ...DEFAULT_EMBEDDINGS, ...cfg };
  }

  /** Embed a batch. Ollama's /api/embed accepts an array and is far faster than one call per text. */
  async embed(texts: string[]): Promise<number[][]> {
    this.#calls++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(`${this.cfg.host}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.cfg.model, input: texts }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`ollama /api/embed ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { embeddings?: number[][] };
      if (!body.embeddings) throw new Error("no embeddings in response");
      return body.embeddings;
    } finally {
      clearTimeout(timer);
    }
  }

  get callCount(): number {
    return this.#calls;
  }
}

/** Unit-normalise so cosine similarity is a dot product. */
export function normalise(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}
