# wasm-db

Browser-native analytical SQL engine. Queries remote Parquet files over HTTP range requests,
runs DuckDB-WASM in a Web Worker, caches byte ranges in IndexedDB/OPFS. Zero backend,
privacy-preserving, reload-safe.

**Success bar**: user opens a multi-GB Parquet URL, explores it with sub-second query latency
after warm cache, entirely in-browser, on a cold tab.

Authoritative product requirements live in `@docs/SPEC.md`. This file is the operational
manual — keep it short. Deep technical context is split into `@docs/agent/*.md`; load those
only when the current task actually touches that domain.

---

## Tech Stack

- **Engine**: `@duckdb/duckdb-wasm` — run only inside `src/workers/duckdb.worker.ts`.
- **Build**: Vite + TypeScript (strict). `pnpm` is the package manager; do not use npm/yarn.
- **State**: Zustand with `persist` middleware, backed by IndexedDB via Dexie.
- **UI**: React 18 + CodeMirror 6 for the SQL editor.
- **Testing**: Vitest (unit), Playwright (E2E, cross-browser).
- **Network**: all HTTP goes through a Service Worker at `src/sw/` and the transport module
  at `src/transport/`. Never call `fetch` directly elsewhere.

## Project Map

```
src/
  engine/        DuckDB worker client, connection lifecycle, query execution
  transport/     HTTP range requests, retry, circuit breaker, CORS probing
  cache/         L1 (memory LRU), L2 (IndexedDB), L3 (OPFS), interval-tree range index
  state/         Zustand stores, persistence, URL-param sync
  ui/            React components (editor, schema tree, results grid, error panel)
  workers/       Web Workers (duckdb, cache); message protocol in protocol.ts
  sw/            Service Worker (network interception, WASM asset caching)
  errors/        Typed error classes — throw these, never raw Error
  util/          logger, feature detection, encoding helpers

tests/
  integration/   cross-layer, reload, worker-lifecycle
  e2e/           Playwright suites per browser
  fixtures/      Parquet files + mock CDN server

docs/
  SPEC.md        Product requirements (the old RFC-style doc — source of truth)
  ROADMAP.md     Phased plan
  agent/         Deep technical context, loaded via @ when relevant
```

## Commands

```bash
pnpm install                  # one-time setup
pnpm dev                      # dev server (sets COOP/COEP headers automatically)
pnpm build                    # production build — verifies WASM size budget
pnpm preview                  # serve built output locally with prod headers

pnpm typecheck                # tsc --noEmit; run this after any code change
pnpm lint                     # eslint + prettier --check
pnpm lint:fix                 # auto-fix

pnpm test                     # Vitest (unit + integration)
pnpm test -- <name-pattern>   # single test, e.g. pnpm test -- "range coalescing"
pnpm test:watch               # watch mode
pnpm test:e2e                 # Playwright, all browsers
pnpm test:e2e -- --project=firefox   # single browser
pnpm test:reload              # reload-safety invariant tests
pnpm test:perf                # cold-start + query latency benchmarks

pnpm analyze                  # bundle-analyzer output, check WASM sizes
```

## Verification — run before declaring a task done

1. `pnpm typecheck && pnpm lint && pnpm test` — always.
2. If you touched `transport/`, `cache/`, or `workers/`: also run `pnpm test:e2e`.
3. If you touched state persistence: also run `pnpm test:reload`.
4. If you touched WASM loading or the Service Worker: manually verify cold-start in Chrome,
   Firefox, and Safari via `pnpm test:perf`. Workers do not HMR cleanly — restart the dev
   server after worker changes.

If any check fails, fix before continuing. Do not paper over failing tests with `.skip`.

---

## Architectural Invariants — DO NOT violate

These exist because violating them costs days to untangle. See `@docs/agent/architecture.md`
for the reasoning.

1. **DuckDB lives in exactly one worker.** Never import `@duckdb/duckdb-wasm` from the main
   thread, from another worker, or from a test that isn't explicitly testing the worker.
2. **Layer direction is one-way**: UI → state → engine → transport → cache. Lower layers
   never import from higher ones. Enforced by `dependency-cruiser` in CI.
3. **All app state must be reload-safe.** New state goes in Zustand with `persist` or in a
   URL param. If you can't persist it, it's ephemeral — document why.
4. **No `fetch` outside `src/transport/`.** All I/O goes through the transport module so the
   Service Worker can intercept, dedupe, and cache it.
5. **No credentials in source.** Signed URLs are user-supplied only. No embedded tokens,
   no build-time secrets, no `.env` values shipped to the client.
6. **Errors are typed.** Throw from `src/errors/`; UI translates via `src/ui/errorMessages.ts`.
   Never surface a raw DuckDB error string to the user.

## Code Conventions

- **TypeScript strict.** No `any`. Use `unknown` with narrowing, or define the type.
- **Imports use the `@/` alias** (configured in `tsconfig.json` + `vite.config.ts`). Relative
  imports only inside the same leaf directory.
- **Cancellation is mandatory** for anything async that could run >100ms. Accept
  `AbortSignal`; propagate it.
- **Logging** goes through `src/util/logger.ts`. No `console.*` in shipped code paths — the
  logger auto-prefixes worker logs with `[worker]` and respects the debug flag.
- **Tests colocated**: `foo.ts` → `foo.test.ts` next to it. Cross-module tests go in
  `tests/integration/`.
- **Commit style**: conventional commits (`feat:`, `fix:`, `perf:`, `refactor:`, `test:`,
  `docs:`, `chore:`). Scope when useful: `feat(cache): ...`.

## Common Task Playbooks

- **Adding a new transport feature** → read `@docs/agent/transport.md` first. Add a Parquet
  fixture to `tests/fixtures/parquet/`. Wire through `src/transport/index.ts`. E2E test
  required; CORS/range behaviour differs per browser.
- **Changing cache behaviour** → read `@docs/agent/caching.md`. Update policy in
  `src/cache/policy.ts`. Must pass Firefox 2MB-chunk tests and Safari quota tests. Do not
  bypass the chunker.
- **Editing worker code** → message types live in `src/workers/protocol.ts`. Add the type
  first, then the worker handler, then the caller in `src/engine/`. Restart the dev server.
- **UI changes involving queries** → never block the render thread. Use the streaming/batch
  result API. Every in-flight operation renders a visible cancel control and progress state.
- **Adding a dependency** → if it's over 50KB gzipped, stop and ask. Check `pnpm analyze`
  before and after.

## Gotchas — these bite hard

- **COOP/COEP required for multi-threading.** Dev server sets them. If the user's deployment
  can't, DuckDB falls back to single-threaded — degrade, don't crash. Detect with
  `src/util/featureDetect.ts:isCrossOriginIsolated()`.
- **Firefox IndexedDB limit**: individual values capped around 2MB. Cache entries are
  pre-chunked in `src/cache/chunker.ts`. Don't write raw bytes to the DB.
- **Safari quirks**: 7-day IndexedDB eviction, no `memory64`, OPFS unavailable on older
  versions. Always feature-detect.
- **Parquet footer fetch** uses a *suffix* range (`Range: bytes=-N`) because
  `Content-Length` lies on some chunked CDNs.
- **DuckDB error strings are terrible UX.** Known errors are mapped in
  `src/engine/errorMap.ts`. Add new mappings there before touching the UI.
- **ETags aren't reliable across CDN edges.** Cache keys include ETag *and* Last-Modified
  *and* content-length as a composite. See `src/cache/keying.ts`.

## When to stop and ask the user

- Changing the shared-link URL format (breaks every URL already in the wild).
- Touching the Service Worker's cache scope or update flow (can hard-brick the site on next
  deploy).
- Relaxing query cost estimation limits or the default timeout (DoS/abuse posture).
- Adding a non-dev dependency over 50KB gzipped.
- Anything that would require loosening COOP/COEP or CSP.

---

## Reference Docs (load only when relevant)

- `@docs/agent/architecture.md` — layer contracts, worker protocol, state shape, reload semantics
- `@docs/agent/caching.md` — three-tier cache, eviction, browser quirks, range coalescing
- `@docs/agent/transport.md` — range requests, retry, circuit breaker, CORS detection
- `@docs/agent/duckdb.md` — worker setup, memory tuning, query cancellation, EXPLAIN plumbing
- `@docs/agent/deployment.md` — COOP/COEP, CDN compatibility, versioning, SW update flow
- `@docs/agent/sharing.md` — hash vs direct URL encoding, schema fingerprint, snapshot mode
- `@docs/agent/security.md` — CORS guidance, signed URLs, query sandboxing, XSS in results
- `@docs/SPEC.md` — full product spec with MUST/SHOULD requirements (read when deriving new
  features or auditing behaviour)
- `@docs/ROADMAP.md` — phased implementation plan; reference when scoping work

## Maintaining this file

Every line here competes for context with the actual task. Before adding anything, ask:
*"Would removing this cause Claude to make mistakes?"* If no, don't add it. If a rule keeps
getting violated, the file is probably too long and the rule is being skimmed past — move
detail into the relevant `docs/agent/*.md` and leave a one-liner pointer here.
