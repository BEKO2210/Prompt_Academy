/**
 * Ollama provider adapter (ADR-0001 Layer 2).
 *
 * "Ollama is the first provider. Ollama is not the architecture." This file is
 * the only place in the repository that knows what an Ollama request looks like.
 * It implements the interface the core defines and knows nothing about
 * retrieval, ranking, arms, datasets, metrics or benchmarks — a test asserts
 * that `engine/core` contains no reference to it.
 *
 * ## Provider normalisation — what actually reaches the model
 *
 * The experimental variable is the injected context. If the adapter silently
 * rewraps, merges or templates the prompt, the thing measured is no longer the
 * thing assembled. So this adapter:
 *
 *   - uses `/api/chat` with an explicit system message and an explicit user
 *     message, rather than `/api/generate`, which would require us to flatten
 *     the two into one string and invent a separator
 *   - records the EXACT request body it sent, and its hash, so the report can
 *     state the measured context rather than the intended one
 *   - does not set any option the caller did not ask for, beyond the ones the
 *     experiment holds constant
 *
 * Ollama still applies the MODEL'S OWN chat template server-side, turning the
 * message array into the token sequence the model sees. That transformation is
 * outside our reach and is identical for every arm, since every arm sends the
 * same shape. It is recorded as a known, unmeasured layer rather than ignored.
 */
import type { GenerateRequest, GenerateResult, Provider, ProviderInfo } from "../core/provider.ts";
import { createHash } from "node:crypto";

export interface OllamaConfig {
  host: string;
  model: string;
  /** Hard ceiling per call. A hung call must not stall the whole run. */
  timeoutMs: number;
  /** Retries on a TRANSPORT error only — never on a bad answer. */
  maxRetries: number;
}

export const DEFAULT_OLLAMA: OllamaConfig = {
  host: "http://127.0.0.1:11434",
  model: "qwen2.5-coder:7b-16k",
  timeoutMs: 180_000,
  maxRetries: 2,
};

/** Everything that went over the wire, for the run record. */
export interface SentRequest {
  bodyHash: string;
  systemChars: number;
  userChars: number;
  options: Record<string, unknown>;
}

export interface OllamaFailure {
  kind: "timeout" | "transport" | "http" | "malformed";
  detail: string;
  attempt: number;
}

export class OllamaProvider implements Provider {
  readonly cfg: OllamaConfig;
  /** Failures are collected, never swallowed — §11 wants them visible. */
  readonly failures: OllamaFailure[] = [];
  readonly sent: SentRequest[] = [];
  #info: ProviderInfo | null = null;

  constructor(cfg: Partial<OllamaConfig> = {}) {
    this.cfg = { ...DEFAULT_OLLAMA, ...cfg };
  }

  /**
   * Resolve the model digest.
   *
   * The digest is the model VERSION for §6. A tag like `qwen2.5-coder:7b` can be
   * repointed at new weights, so recording the tag alone would not detect a
   * mid-run change — which ENG-008 §7 calls a hard stop.
   */
  async info(): Promise<ProviderInfo> {
    if (this.#info) return this.#info;
    const res = await fetch(`${this.cfg.host}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.cfg.model }),
    });
    if (!res.ok) throw new Error(`ollama /api/show ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { details?: Record<string, unknown> };
    const digest = await this.#digest();
    this.#info = {
      provider: "ollama",
      model: this.cfg.model,
      // Digest first; the parameter/quantisation details are a fallback so the
      // field is never empty and never silently the tag alone.
      modelVersion: digest ?? JSON.stringify(body.details ?? {}),
    };
    return this.#info;
  }

  async #digest(): Promise<string | null> {
    const res = await fetch(`${this.cfg.host}/api/tags`);
    if (!res.ok) return null;
    const body = (await res.json()) as { models?: Array<{ name: string; digest?: string }> };
    return body.models?.find((m) => m.name === this.cfg.model)?.digest ?? null;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    // Only the constants the experiment holds. Nothing else is set, so the
    // model's own defaults apply identically to every arm.
    const options: Record<string, unknown> = {
      temperature: req.temperature,
      num_predict: req.maxTokens,
    };
    if (req.seed !== undefined) options.seed = req.seed;

    const body = {
      model: this.cfg.model,
      stream: false,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      options,
    };
    const serialised = JSON.stringify(body);
    this.sent.push({
      bodyHash: createHash("sha256").update(serialised).digest("hex"),
      systemChars: req.system.length,
      userChars: req.user.length,
      options,
    });

    let lastError: OllamaFailure | null = null;
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetch(`${this.cfg.host}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: serialised,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          lastError = { kind: "http", detail: `${res.status} ${await res.text()}`, attempt };
          this.failures.push(lastError);
          continue;
        }
        const json = (await res.json()) as {
          message?: { content?: string };
          prompt_eval_count?: number;
          eval_count?: number;
        };
        const text = json.message?.content;
        if (typeof text !== "string") {
          // A 200 with no content is a malformed answer, not a transport fault.
          // Retrying it would only repeat the same shape, so it is recorded and
          // returned as an empty output for the evaluator to fail honestly.
          lastError = { kind: "malformed", detail: JSON.stringify(json).slice(0, 300), attempt };
          this.failures.push(lastError);
          return {
            text: "", inputTokens: json.prompt_eval_count ?? 0,
            outputTokens: json.eval_count ?? 0, latencyMs: Date.now() - started,
          };
        }
        return {
          text,
          // Ollama's own counts. Recorded as reported; not re-derived, because a
          // local tokeniser estimate would be a different number wearing the
          // same name.
          inputTokens: json.prompt_eval_count ?? 0,
          outputTokens: json.eval_count ?? 0,
          latencyMs: Date.now() - started,
        };
      } catch (e) {
        clearTimeout(timer);
        const aborted = e instanceof Error && e.name === "AbortError";
        lastError = {
          kind: aborted ? "timeout" : "transport",
          detail: e instanceof Error ? e.message : String(e),
          attempt,
        };
        this.failures.push(lastError);
      }
    }
    throw new Error(`ollama failed after ${this.cfg.maxRetries + 1} attempts: ${lastError?.detail}`);
  }
}
