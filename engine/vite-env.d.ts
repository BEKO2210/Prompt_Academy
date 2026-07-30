/**
 * `import.meta.env` for the shared site modules.
 *
 * engine/core/retrieval.ts imports site/src/lib/*.ts (ADR-0001: one ranking
 * implementation, two consumers), and site/src/lib/data.ts reads
 * `import.meta.env.BASE_URL`. Under the site's own tsconfig that type comes from
 * vite/client; under this one it does not, because `typeRoots` is pointed at
 * site/node_modules/@types and vite ships its client types outside @types.
 *
 * Declared here rather than widening typeRoots, so the engine does not acquire
 * a compile-time dependency on the bundler it deliberately does not use.
 */
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly [key: string]: unknown;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
