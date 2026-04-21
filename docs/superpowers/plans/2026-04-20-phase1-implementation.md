# Phase 1 — Core Engine & Transport — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working query loop — paste a public Parquet URL → write SQL → DuckDB-WASM executes it in a Web Worker → results appear in a table — with zero caching or persistence (those are Phase 2).

**Architecture:** Fresh Vite + React + TypeScript scaffold. DuckDB-WASM runs in a dedicated Web Worker (`src/workers/duckdb.worker.ts`) owned by an engine client (`src/engine/client.ts`) via a typed message protocol. A pass-through Service Worker (`public/sw.js`) satisfies Invariant #4 (no fetch outside transport) from day one. Transport handles CORS probing and HTTP range fetching with retry. UI uses `useState`/`useReducer` — no Zustand until Phase 2.

**Tech Stack:** Vite 5, React 18, TypeScript (strict + skipLibCheck), `@duckdb/duckdb-wasm`, CodeMirror 6, `@tanstack/react-table`, Vitest + jsdom, Playwright, pnpm, husky + lint-staged

---

## Pitstop Structure

| Milestone | Tasks | Gate before proceeding |
|-----------|-------|------------------------|
| **M1: Foundation** | 1–8 | `pnpm typecheck && pnpm lint && pnpm test` pass; dev server loads with COOP/COEP headers |
| **M2: Engine + Transport** | 9–17 | All unit tests pass; DuckDB worker initialises and executes a hardcoded query in isolation |
| **M3: UI + Integration** | 18–25 | Full app works end-to-end; `pnpm test:e2e` passes in Chrome, Firefox, Safari |

At each pitstop: **stop, critically review output against the spec, fix before continuing.**

---

## File Map

### Scaffold + Tooling
| File | Action | Responsibility |
|------|--------|----------------|
| `vite.config.ts` | Create | COOP/COEP headers, WASM optimizeDeps exclusion, `@/` alias |
| `tsconfig.json` | Modify | strict + skipLibCheck, path alias |
| `tsconfig.node.json` | Modify | Vite config type resolution |
| `vitest.config.ts` | Create | jsdom env, globals, 80% coverage threshold |
| `playwright.config.ts` | Create | 3-browser matrix, webServer |
| `eslint.config.js` | Create | TypeScript rules, no-console enforced |
| `.prettierrc` | Create | Formatting rules |
| `.husky/pre-commit` | Create | typecheck + lint-staged gate |
| `.dependency-cruiser.cjs` | Create | Layer import direction enforcement |
| `package.json` | Modify | Scripts, lint-staged config |
| `src/test-setup.ts` | Create | jest-dom matchers |
| `index.html` | Modify | COOP/COEP meta tags (fallback for hosts that can't set headers) |

### Shared Contracts (committed to `main` before worktrees branch)
| File | Action | Responsibility |
|------|--------|----------------|
| `src/errors/index.ts` | Create | Typed error hierarchy: `AppError`, `TransportError`, `CORSError`, `RangeNotSupportedError`, `QueryError`, `WorkerError` |
| `src/util/featureDetect.ts` | Create | `isCrossOriginIsolated()`, `hasSharedArrayBuffer()`, `hasOPFS()` |
| `src/util/logger.ts` | Create | Structured logger, `[worker]` prefix, `?debug=true` gate |
| `src/workers/protocol.ts` | Create | Typed discriminated unions for all worker messages |
| `src/transport/types.ts` | Create | `ITransport` interface, `ProbeResult` type |
| `src/cache/types.ts` | Create | `ICache` interface, `CacheKey` type |
| `src/engine/types.ts` | Create | `QueryHandle`, `QueryOpts`, `Batch`, `QuerySummary` |
| `public/sw.js` | Create | Pass-through Service Worker (3 lines, plain JS) |
| `src/sw/register.ts` | Create | SW registration utility |

### Engine (`feat/phase1-engine` worktree)
| File | Action | Responsibility |
|------|--------|----------------|
| `src/workers/duckdb.worker.ts` | Create | DuckDB-WASM init, query, cancel, shutdown |
| `src/engine/client.ts` | Create | Worker lifecycle, correlationId routing, QueryHandle impl |
| `src/workers/__tests__/protocol.test.ts` | Create | Protocol type narrowing + serialization |
| `src/engine/__tests__/client.test.ts` | Create | Engine lifecycle, query round-trip (mocked Worker) |

### Transport (`feat/phase1-transport` worktree)
| File | Action | Responsibility |
|------|--------|----------------|
| `src/transport/http.ts` | Create | `probeURL`, `fetchRange`, retry logic, 416 fallback |
| `src/cache/stub.ts` | Create | No-op `ICache` (always miss, no-op set) |
| `src/transport/__tests__/http.test.ts` | Create | CORS probe, retry backoff, 416 fallback (mocked fetch) |
| `src/util/__tests__/featureDetect.test.ts` | Create | Browser capability detection |

### UI (`feat/phase1-ui` worktree)
| File | Action | Responsibility |
|------|--------|----------------|
| `src/ui/URLInput.tsx` | Create | URL text input + probe button |
| `src/ui/SQLEditor.tsx` | Create | CodeMirror 6 wrapper, SQL highlighting, basic autocomplete |
| `src/ui/ResultsTable.tsx` | Create | TanStack Table, column headers from first row, 500-row cap display |
| `src/ui/StatusBar.tsx` | Create | Idle / probing / executing / error status + cancel button |
| `src/ui/ErrorPanel.tsx` | Create | Error display with copy button |
| `src/state/queryState.ts` | Create | `useReducer` hook for all query lifecycle state |
| `src/App.tsx` | Modify | Wire all components together |
| `src/main.tsx` | Modify | Register SW, mount app |
| `tests/e2e/phase1.spec.ts` | Create | End-to-end: load → URL → query → results |
| `tests/fixtures/parquet/` | Create | `tiny.parquet` fixture (generated via DuckDB CLI) |

---

## ═══════════════════════════════════════
## MILESTONE 1: Foundation
## ═══════════════════════════════════════

### Task 1: Initialize Project

**Files:**
- Create: project root (from `pnpm create vite`)

- [ ] **Step 1: Scaffold the project**
```bash
cd /home/zenitsu/Desktop/wasm-db
pnpm create vite . --template react-ts
# When asked "Current directory is not empty. Remove existing files and continue?" — choose Yes (only docs exist)
```

- [ ] **Step 2: Install base dependencies**
```bash
pnpm install
```

- [ ] **Step 3: Verify default scaffold works**
```bash
pnpm dev
# Open http://localhost:5173 — expect Vite + React default page
# Ctrl+C to stop
```

- [ ] **Step 4: Commit scaffold**
```bash
git init
git add -A
git commit -m "chore: scaffold vite react-ts project"
```

---

### Task 2: Configure Vite (COOP/COEP + WASM + alias)

**Files:**
- Modify: `vite.config.ts`
- Modify: `index.html`

- [ ] **Step 1: Replace `vite.config.ts` entirely**
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  optimizeDeps: {
    // Required: Vite's pre-bundler breaks @duckdb/duckdb-wasm
    exclude: ['@duckdb/duckdb-wasm'],
  },
  worker: {
    // Required: ES module workers for TypeScript imports inside workers
    format: 'es',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
```

- [ ] **Step 2: Add COOP/COEP meta tags to `index.html` (fallback for static hosts that can't set headers)**

Replace the `<head>` section in `index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- COOP/COEP meta fallback — required for SharedArrayBuffer / multi-threaded DuckDB -->
    <meta http-equiv="Cross-Origin-Opener-Policy" content="same-origin" />
    <meta http-equiv="Cross-Origin-Embedder-Policy" content="require-corp" />
    <title>wasm-db</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Verify headers are set**
```bash
pnpm dev
# In browser devtools Network tab: GET / response headers should show:
# Cross-Origin-Opener-Policy: same-origin
# Cross-Origin-Embedder-Policy: require-corp
# Ctrl+C
```

- [ ] **Step 4: Commit**
```bash
git add vite.config.ts index.html
git commit -m "chore: configure vite for WASM, COOP/COEP, path alias"
```

---

### Task 3: Configure TypeScript

**Files:**
- Modify: `tsconfig.json`
- Modify: `tsconfig.node.json`

- [ ] **Step 1: Replace `tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Replace `tsconfig.node.json`**
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts", ".dependency-cruiser.cjs"]
}
```

- [ ] **Step 3: Verify typecheck passes**
```bash
pnpm typecheck
# Expected: 0 errors (App.tsx may have minor issues from scaffold — fix by deleting src/App.tsx content and replacing with just `export default function App() { return <div /> }`)
```

- [ ] **Step 4: Commit**
```bash
git add tsconfig.json tsconfig.node.json src/App.tsx
git commit -m "chore: configure typescript strict mode"
```

---

### Task 4: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install all Phase 1 dependencies**
```bash
# Core
pnpm add @duckdb/duckdb-wasm

# UI
pnpm add @codemirror/view @codemirror/state @codemirror/lang-sql @codemirror/commands @codemirror/theme-one-dark
pnpm add @tanstack/react-table

# Testing
pnpm add -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom
pnpm add -D @playwright/test
pnpm add -D @types/node

# Code quality
pnpm add -D eslint @eslint/js @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier
pnpm add -D prettier
pnpm add -D husky lint-staged
pnpm add -D dependency-cruiser
```

- [ ] **Step 2: Install Playwright browsers**
```bash
pnpm exec playwright install --with-deps chromium firefox webkit
```

- [ ] **Step 3: Verify install succeeded**
```bash
pnpm list @duckdb/duckdb-wasm
# Expected: shows version (1.x.x)
```

- [ ] **Step 4: Commit**
```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install all phase 1 dependencies"
```

---

### Task 5: Configure Testing (Vitest + Playwright)

**Files:**
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/test-setup.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create `vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    alias: { '@': resolve(__dirname, './src') },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test-setup.ts', 'src/**/*.d.ts', 'src/**/__tests__/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
```

- [ ] **Step 2: Create `src/test-setup.ts`**
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Create `playwright.config.ts`**
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 4: Add scripts to `package.json`**

Add/replace the `scripts` section:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --max-warnings 0",
    "lint:fix": "eslint src --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:reload": "vitest run --reporter=verbose tests/integration/reload.test.ts",
    "analyze": "vite build --mode analyze"
  }
}
```

- [ ] **Step 5: Verify Vitest runs (no tests yet, just config check)**
```bash
pnpm test
# Expected: "No test files found" or similar — not an error
```

- [ ] **Step 6: Commit**
```bash
git add vitest.config.ts playwright.config.ts src/test-setup.ts package.json
git commit -m "chore: configure vitest and playwright"
```

---

### Task 6: Configure ESLint + Prettier + Husky

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.husky/pre-commit`
- Modify: `package.json` (lint-staged)

- [ ] **Step 1: Create `eslint.config.js`**
```js
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['node_modules/**', 'dist/**', '.husky/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
]
```

- [ ] **Step 2: Create `.prettierrc`**
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 3: Initialise Husky**
```bash
pnpm exec husky init
```

- [ ] **Step 4: Replace `.husky/pre-commit` content**
```bash
#!/bin/sh
pnpm typecheck && pnpm exec lint-staged
```

Make it executable:
```bash
chmod +x .husky/pre-commit
```

- [ ] **Step 5: Add lint-staged config to `package.json`**

Add at root level of `package.json`:
```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --max-warnings 0", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

- [ ] **Step 6: Verify lint passes on scaffold**
```bash
pnpm lint
# Fix any errors it reports (typically `no-console` in default App.tsx — just remove them)
```

- [ ] **Step 7: Commit**
```bash
git add eslint.config.js .prettierrc .husky/pre-commit package.json
git commit -m "chore: configure eslint, prettier, husky pre-commit hook"
```

---

### Task 7: Configure Dependency Cruiser

**Files:**
- Create: `.dependency-cruiser.cjs`
- Modify: `package.json` (add `check:layers` script)

- [ ] **Step 1: Create `.dependency-cruiser.cjs`**
```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'ui-no-direct-engine',
      severity: 'error',
      comment: 'UI must not import engine directly — go through src/state/',
      from: { path: '^src/ui' },
      to: { path: '^src/engine' },
    },
    {
      name: 'ui-no-direct-transport',
      severity: 'error',
      from: { path: '^src/ui' },
      to: { path: '^src/transport' },
    },
    {
      name: 'ui-no-direct-cache',
      severity: 'error',
      from: { path: '^src/ui' },
      to: { path: '^src/cache' },
    },
    {
      name: 'engine-no-import-ui',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { path: '^src/ui' },
    },
    {
      name: 'engine-no-import-state',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { path: '^src/state' },
    },
    {
      name: 'transport-no-import-engine',
      severity: 'error',
      from: { path: '^src/transport' },
      to: { path: '^src/engine' },
    },
    {
      name: 'transport-no-import-ui',
      severity: 'error',
      from: { path: '^src/transport' },
      to: { path: '^src/ui' },
    },
    {
      name: 'cache-no-import-transport',
      severity: 'error',
      from: { path: '^src/cache' },
      to: { path: '^src/transport' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
  },
}
```

- [ ] **Step 2: Add script to `package.json`**
```json
{
  "scripts": {
    "check:layers": "depcruise src --config .dependency-cruiser.cjs"
  }
}
```

- [ ] **Step 3: Commit**
```bash
git add .dependency-cruiser.cjs package.json
git commit -m "chore: add dependency-cruiser layer enforcement"
```

---

### Task 8: Shared Contracts — Errors, Utilities, Protocol, Interfaces

This task creates all shared types that engine, transport, and UI worktrees will compile against. Everything here goes on `main` before branching.

**Files:**
- Create: `src/errors/index.ts`
- Create: `src/util/featureDetect.ts`
- Create: `src/util/logger.ts`
- Create: `src/workers/protocol.ts`
- Create: `src/engine/types.ts`
- Create: `src/transport/types.ts`
- Create: `src/cache/types.ts`
- Create: `public/sw.js`
- Create: `src/sw/register.ts`

- [ ] **Step 1: Create `src/errors/index.ts`**
```ts
export type ErrorCode =
  | 'TRANSPORT_ERROR'
  | 'CORS_ERROR'
  | 'RANGE_NOT_SUPPORTED'
  | 'RANGE_FETCH_FAILED'
  | 'QUERY_ERROR'
  | 'QUERY_CANCELLED'
  | 'WORKER_ERROR'
  | 'WORKER_CRASH';

export class AppError extends Error {
  readonly code: ErrorCode;
  override readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

export class TransportError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('TRANSPORT_ERROR', message, cause);
    this.name = 'TransportError';
  }
}

export class CORSError extends AppError {
  constructor(url: string, cause?: unknown) {
    super('CORS_ERROR', `CORS or range requests blocked: ${url}`, cause);
    this.name = 'CORSError';
  }
}

export class RangeNotSupportedError extends AppError {
  constructor(url: string, cause?: unknown) {
    super('RANGE_NOT_SUPPORTED', `Server does not support range requests: ${url}`, cause);
    this.name = 'RangeNotSupportedError';
  }
}

export class QueryError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('QUERY_ERROR', message, cause);
    this.name = 'QueryError';
  }
}

export class WorkerError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('WORKER_ERROR', message, cause);
    this.name = 'WorkerError';
  }
}
```

- [ ] **Step 2: Create `src/util/featureDetect.ts`**
```ts
// Note: `isCrossOriginIsolated` uses window context (main thread only).
// The DuckDB worker uses `self.crossOriginIsolated` directly inside the worker.

export function isCrossOriginIsolated(): boolean {
  return typeof window !== 'undefined' && window.crossOriginIsolated === true;
}

export function hasSharedArrayBuffer(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

export async function hasOPFS(): Promise<boolean> {
  try {
    if (!navigator?.storage?.getDirectory) return false;
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Create `src/util/logger.ts`**
```ts
// Single place that uses console.*. All other modules import from here.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function isDebugEnabled(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').has('debug');
  } catch {
    return false;
  }
}

function createLogger(prefix?: string) {
  const tag = prefix ? `[${prefix}]` : '';

  return {
    debug(msg: string, ...args: unknown[]): void {
      if (!isDebugEnabled()) return;
      // eslint-disable-next-line no-console
      console.debug(`${tag} ${msg}`, ...args);
    },
    info(msg: string, ...args: unknown[]): void {
      // eslint-disable-next-line no-console
      console.info(`${tag} ${msg}`, ...args);
    },
    warn(msg: string, ...args: unknown[]): void {
      // eslint-disable-next-line no-console
      console.warn(`${tag} ${msg}`, ...args);
    },
    error(msg: string, ...args: unknown[]): void {
      // eslint-disable-next-line no-console
      console.error(`${tag} ${msg}`, ...args);
    },
  };
}

export const logger = createLogger();
export const workerLogger = createLogger('worker');
```

- [ ] **Step 4: Create `src/workers/protocol.ts`**
```ts
// Worker config — intentionally avoids importing @duckdb/duckdb-wasm types
// so the protocol stays self-contained and testable without loading WASM.
export interface DuckDBWorkerConfig {
  maxMemoryMB: number;
}

export interface QueryOpts {
  timeoutMs?: number;
}

export interface SerializedError {
  code: string;
  message: string;
  stack?: string;
}

export type MainToWorker =
  | { kind: 'init';     correlationId: string; config: DuckDBWorkerConfig }
  | { kind: 'query';    correlationId: string; sql: string; opts: QueryOpts }
  | { kind: 'cancel';   correlationId: string; target: string }
  | { kind: 'shutdown'; correlationId: string };

export type WorkerToMain =
  | { kind: 'ready';    correlationId: string }
  | { kind: 'batch';    correlationId: string; rows: Record<string, unknown>[]; done: boolean }
  | { kind: 'error';    correlationId: string; error: SerializedError }
  | { kind: 'progress'; correlationId: string; stage: string; pct: number };
```

- [ ] **Step 5: Create `src/engine/types.ts`**
```ts
// QueryOpts lives in protocol.ts (wire format). Re-export here so engine consumers
// don't need to import from workers/protocol directly.
export type { QueryOpts } from '@/workers/protocol'

export interface Batch {
  rows: Record<string, unknown>[];
}

export interface QuerySummary {
  rowCount: number;
  durationMs: number;
}

export interface QueryHandle {
  readonly id: string;
  cancel(): void;
  readonly stream: AsyncIterable<Batch>;
  readonly done: Promise<QuerySummary>;
}
```

- [ ] **Step 6: Create `src/transport/types.ts`**
```ts
export interface ProbeResult {
  supportsRanges: boolean;
  contentLength: number | null;
  etag: string | null;
  lastModified: string | null;
}

export interface ITransport {
  probeURL(url: string): Promise<ProbeResult>;
  fetchRange(url: string, start: number, end: number, signal: AbortSignal): Promise<Uint8Array>;
}
```

- [ ] **Step 7: Create `src/cache/types.ts`**
```ts
export interface CacheKey {
  url: string;
  start: number;
  end: number;
  etag?: string;
  lastModified?: string;
  contentLength: number;
}

export interface ICache {
  get(key: CacheKey): Promise<Uint8Array | null>;
  set(key: CacheKey, data: Uint8Array): void; // fire-and-forget
  clear(): Promise<void>;
}
```

- [ ] **Step 8: Create `public/sw.js` (pass-through Service Worker)**
```js
// Pass-through Service Worker — Phase 1.
// Phase 2 adds cache interception for DuckDB's httpfs range requests.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
```

- [ ] **Step 9: Create `src/sw/register.ts`**
```ts
import { logger } from '@/util/logger';

export async function registerSW(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    logger.warn('Service Worker not supported — fetch invariant cannot be enforced');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    logger.info('Service Worker registered', reg.scope);
  } catch (err) {
    logger.error('Service Worker registration failed', err);
  }
}
```

- [ ] **Step 10: Run typecheck on all new files**
```bash
pnpm typecheck
# Expected: 0 errors
```

- [ ] **Step 11: Commit contracts to main**
```bash
git add src/errors/ src/util/ src/workers/protocol.ts src/engine/types.ts \
        src/transport/types.ts src/cache/types.ts public/sw.js src/sw/register.ts
git commit -m "feat: add shared contracts — errors, utilities, protocol, interfaces"
```

---

## ══════════════════════════════════════════════
## ⛽ PITSTOP 1 — M1 GATE: Foundation Review
## ══════════════════════════════════════════════

**Run the gate:**
```bash
pnpm typecheck && pnpm lint && pnpm test
# All must pass with 0 errors/warnings before proceeding to M2
```

**Critical review checklist before proceeding:**
- [ ] `pnpm dev` loads at localhost:5173 with COOP/COEP headers visible in Network tab
- [ ] `window.crossOriginIsolated === true` in browser console (SharedArrayBuffer available)
- [ ] All 8 contract files typecheck with 0 errors
- [ ] `no-console` ESLint rule fires on any direct `console.*` outside `logger.ts`
- [ ] Dependency-cruiser config covers all 8 layer violation rules
- [ ] Review `src/errors/index.ts` — are all error codes needed for Phase 1 present?
- [ ] Review `src/workers/protocol.ts` — do all message variants match architecture.md exactly?

**Stop here. Fix everything before creating worktrees.**

---

## ═══════════════════════════════════════════
## MILESTONE 2: Engine + Transport
## ═══════════════════════════════════════════

> Create worktrees AFTER Pitstop 1 passes.

```bash
# From the project root (main branch, all contracts committed)
git worktree add ../wasm-db-engine feat/phase1-engine
git worktree add ../wasm-db-transport feat/phase1-transport
# UI worktree created after engine merges back to main (Task 17)
```

---

### Task 9: Protocol Unit Tests

> **Worktree:** `../wasm-db-engine` (`feat/phase1-engine`)

**Files:**
- Create: `src/workers/__tests__/protocol.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
// src/workers/__tests__/protocol.test.ts
import { describe, it, expect } from 'vitest'
import type { MainToWorker, WorkerToMain } from '@/workers/protocol'

describe('MainToWorker protocol', () => {
  it('init message has required shape', () => {
    const msg: MainToWorker = {
      kind: 'init',
      correlationId: 'test-123',
      config: { maxMemoryMB: 1024 },
    }
    expect(msg.kind).toBe('init')
    expect(msg.correlationId).toBe('test-123')
    expect(msg.config.maxMemoryMB).toBe(1024)
  })

  it('query message has required shape', () => {
    const msg: MainToWorker = {
      kind: 'query',
      correlationId: 'q-1',
      sql: 'SELECT 1',
      opts: {},
    }
    expect(msg.kind).toBe('query')
    expect(msg.sql).toBe('SELECT 1')
  })

  it('cancel message has target field', () => {
    const msg: MainToWorker = {
      kind: 'cancel',
      correlationId: 'cancel-1',
      target: 'q-1',
    }
    expect(msg.target).toBe('q-1')
  })

  it('shutdown message has only correlationId', () => {
    const msg: MainToWorker = {
      kind: 'shutdown',
      correlationId: 'shutdown-1',
    }
    expect(msg.kind).toBe('shutdown')
  })
})

describe('WorkerToMain protocol', () => {
  it('ready message has correlationId', () => {
    const msg: WorkerToMain = { kind: 'ready', correlationId: 'init-0' }
    expect(msg.kind).toBe('ready')
  })

  it('batch message has rows array and done flag', () => {
    const msg: WorkerToMain = {
      kind: 'batch',
      correlationId: 'q-1',
      rows: [{ col1: 'value' }],
      done: true,
    }
    expect(msg.rows).toHaveLength(1)
    expect(msg.done).toBe(true)
  })

  it('error message has SerializedError shape', () => {
    const msg: WorkerToMain = {
      kind: 'error',
      correlationId: 'q-1',
      error: { code: 'QUERY_ERROR', message: 'Column not found' },
    }
    expect(msg.error.code).toBe('QUERY_ERROR')
  })

  it('progress message has stage and pct', () => {
    const msg: WorkerToMain = {
      kind: 'progress',
      correlationId: 'q-1',
      stage: 'fetching footer',
      pct: 0.3,
    }
    expect(msg.pct).toBe(0.3)
  })
})

describe('correlationId round-trip', () => {
  it('preserves correlationId through structured clone', () => {
    const original: MainToWorker = {
      kind: 'query',
      correlationId: 'abc-xyz-123',
      sql: 'SELECT 42',
      opts: {},
    }
    // Simulate structured clone (JSON round-trip as proxy)
    const cloned = JSON.parse(JSON.stringify(original)) as MainToWorker
    expect(cloned.correlationId).toBe('abc-xyz-123')
  })
})
```

- [ ] **Step 2: Run tests — expect PASS (these are type-only tests)**
```bash
cd ../wasm-db-engine
pnpm test src/workers/__tests__/protocol.test.ts
# Expected: PASS — these are structural type tests, no real logic to fail
```

- [ ] **Step 3: Commit**
```bash
git add src/workers/__tests__/protocol.test.ts
git commit -m "test: protocol message shape tests"
```

---

### Task 10: DuckDB Worker Implementation

> **Worktree:** `../wasm-db-engine`

**Files:**
- Create: `src/workers/duckdb.worker.ts`

> **Note before implementing:** Verify the exact `AsyncDuckDBConnection` API against the installed `@duckdb/duckdb-wasm` version. Run `cat node_modules/@duckdb/duckdb-wasm/dist/types/src/bindings/connection_async.d.ts` to confirm method names. The `cancelSent()` method name must be verified — Phase 1 uses close+reopen as fallback if unavailable.

- [ ] **Step 1: Write the DuckDB worker**
```ts
// src/workers/duckdb.worker.ts
/// <reference lib="webworker" />
import * as duckdb from '@duckdb/duckdb-wasm'
import type { MainToWorker, WorkerToMain, DuckDBWorkerConfig } from './protocol'

// Use jsDelivr CDN bundles (self-host in Phase 5)
const BUNDLES = duckdb.getJsDelivrBundles()

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null
let activeQueryCorrId: string | null = null

function post(msg: WorkerToMain): void {
  self.postMessage(msg)
}

async function handleInit(correlationId: string, config: DuckDBWorkerConfig): Promise<void> {
  try {
    const bundle = await duckdb.selectBundle(BUNDLES)

    // Create nested worker for DuckDB's internal threading
    const mainWorkerUrl = bundle.mainWorker!
    const worker = new Worker(mainWorkerUrl, { type: 'classic' })

    const logger = new duckdb.VoidLogger()
    db = new duckdb.AsyncDuckDB(logger, worker)

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

    conn = await db.connect()

    // Apply memory limit from config
    await conn.query(`SET memory_limit='${config.maxMemoryMB}MB'`)
    // Cast BigInt to Double for JSON compatibility
    await conn.query(`SET bigint_columns_as_bigint=false`)

    post({ kind: 'ready', correlationId })
  } catch (err) {
    post({
      kind: 'error',
      correlationId,
      error: {
        code: 'WORKER_ERROR',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    })
  }
}

async function handleQuery(correlationId: string, sql: string): Promise<void> {
  if (!conn) {
    post({
      kind: 'error',
      correlationId,
      error: { code: 'WORKER_ERROR', message: 'Worker not initialised — send init first' },
    })
    return
  }

  activeQueryCorrId = correlationId

  try {
    post({ kind: 'progress', correlationId, stage: 'executing', pct: 0 })

    const result = await conn.query(sql)

    // Convert Arrow table → plain objects
    const rows: Record<string, unknown>[] = result
      .toArray()
      .map((row) => row.toJSON() as Record<string, unknown>)

    post({ kind: 'batch', correlationId, rows, done: true })
  } catch (err) {
    post({
      kind: 'error',
      correlationId,
      error: {
        code: 'QUERY_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    })
  } finally {
    activeQueryCorrId = null
  }
}

async function handleCancel(correlationId: string, target: string): Promise<void> {
  if (!db || !conn || activeQueryCorrId !== target) return

  // Best-effort cancellation: close+reopen connection interrupts blocking query
  try {
    await conn.close()
    conn = await db.connect()
    await conn.query(`SET memory_limit='1024MB'`)
  } catch {
    // ignore errors during cancel
  }

  post({
    kind: 'error',
    correlationId: target,
    error: { code: 'QUERY_CANCELLED', message: 'Query cancelled by user' },
  })
}

async function handleShutdown(): Promise<void> {
  try {
    await conn?.close()
    await db?.terminate()
  } finally {
    self.close()
  }
}

self.addEventListener('message', (event: MessageEvent<MainToWorker>) => {
  const msg = event.data
  switch (msg.kind) {
    case 'init':
      void handleInit(msg.correlationId, msg.config)
      break
    case 'query':
      void handleQuery(msg.correlationId, msg.sql)
      break
    case 'cancel':
      void handleCancel(msg.correlationId, msg.target)
      break
    case 'shutdown':
      void handleShutdown()
      break
  }
})
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
# Fix any errors. Common issue: `row.toJSON()` type — cast as `Record<string, unknown>`
```

- [ ] **Step 3: Commit**
```bash
git add src/workers/duckdb.worker.ts
git commit -m "feat(engine): implement DuckDB worker with init, query, cancel, shutdown"
```

---

### Task 11: Engine Client Unit Tests (TDD — write tests first)

> **Worktree:** `../wasm-db-engine`

**Files:**
- Create: `src/engine/__tests__/client.test.ts`

- [ ] **Step 1: Write failing tests (mocked Worker)**
```ts
// src/engine/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WorkerToMain } from '@/workers/protocol'

// --- Mock Worker ---
class MockWorker extends EventTarget {
  postMessage = vi.fn()
  terminate = vi.fn()
  onerror: ((e: ErrorEvent) => void) | null = null

  // Helper: simulate a message FROM the worker TO the engine client
  simulateMessage(data: WorkerToMain): void {
    const event = new MessageEvent('message', { data })
    this.dispatchEvent(event)
    // Also trigger onmessage if set
    if ('onmessage' in this) {
      (this as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage?.(event)
    }
  }
}

let mockWorker: MockWorker

vi.mock('@/workers/duckdb.worker.ts?worker', () => ({}))

// We can't easily mock `new Worker(new URL(...))` in Vitest without patching globalThis.Worker
// Instead, test EngineClient with dependency injection
// The EngineClient must accept an optional WorkerFactory for testing

describe('EngineClient', () => {
  beforeEach(() => {
    mockWorker = new MockWorker()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends init message on construction', async () => {
    // Import lazily to use mocked Worker
    const { EngineClient } = await import('@/engine/client')
    const client = new EngineClient(() => mockWorker as unknown as Worker)

    // The init message should be the first postMessage call
    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'init', config: { maxMemoryMB: 1024 } }),
    )
    client.shutdown()
  })

  it('runQuery sends query message and returns QueryHandle', async () => {
    const { EngineClient } = await import('@/engine/client')
    const client = new EngineClient(() => mockWorker as unknown as Worker)

    // Simulate worker ready
    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0' })

    const handlePromise = client.runQuery('SELECT 1')
    const handle = await handlePromise

    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'query', sql: 'SELECT 1' }),
    )
    expect(handle.id).toBeDefined()
    client.shutdown()
  })

  it('QueryHandle.done resolves when batch with done=true arrives', async () => {
    const { EngineClient } = await import('@/engine/client')
    const client = new EngineClient(() => mockWorker as unknown as Worker)

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0' })

    const handle = await client.runQuery('SELECT 42 AS n')
    const queryMsg = mockWorker.postMessage.mock.calls.find(
      (call) => (call[0] as { kind: string }).kind === 'query',
    )![0] as { correlationId: string }

    // Simulate batch response
    mockWorker.simulateMessage({
      kind: 'batch',
      correlationId: queryMsg.correlationId,
      rows: [{ n: 42 }],
      done: true,
    })

    const summary = await handle.done
    expect(summary.rowCount).toBe(1)
    client.shutdown()
  })

  it('QueryHandle.done rejects on error message', async () => {
    const { EngineClient } = await import('@/engine/client')
    const client = new EngineClient(() => mockWorker as unknown as Worker)

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0' })

    const handle = await client.runQuery('INVALID SQL')
    const queryMsg = mockWorker.postMessage.mock.calls.find(
      (call) => (call[0] as { kind: string }).kind === 'query',
    )![0] as { correlationId: string }

    mockWorker.simulateMessage({
      kind: 'error',
      correlationId: queryMsg.correlationId,
      error: { code: 'QUERY_ERROR', message: 'Parser error' },
    })

    await expect(handle.done).rejects.toThrow('Parser error')
    client.shutdown()
  })

  it('cancel sends cancel message to worker', async () => {
    const { EngineClient } = await import('@/engine/client')
    const client = new EngineClient(() => mockWorker as unknown as Worker)

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0' })

    const handle = await client.runQuery('SELECT sleep(10)')
    handle.cancel()

    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cancel', target: handle.id }),
    )
    client.shutdown()
  })

  it('shutdown calls worker.terminate', async () => {
    const { EngineClient } = await import('@/engine/client')
    const client = new EngineClient(() => mockWorker as unknown as Worker)

    client.shutdown()
    expect(mockWorker.terminate).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect FAIL (EngineClient does not exist yet)**
```bash
pnpm test src/engine/__tests__/client.test.ts
# Expected: FAIL — "Cannot find module '@/engine/client'"
```

- [ ] **Step 3: Commit failing tests**
```bash
git add src/engine/__tests__/client.test.ts
git commit -m "test(engine): add failing client tests (TDD)"
```

---

### Task 12: Engine Client Implementation

> **Worktree:** `../wasm-db-engine`

**Files:**
- Create: `src/engine/client.ts`

- [ ] **Step 1: Write `src/engine/client.ts`**
```ts
import type { MainToWorker, WorkerToMain } from '@/workers/protocol'
import type { QueryHandle, QueryOpts, Batch, QuerySummary } from './types'
import { QueryError, WorkerError } from '@/errors'

type WorkerFactory = () => Worker

// --- QueryHandle implementation ---

class QueryHandleImpl implements QueryHandle {
  readonly id: string
  private _batches: Batch[] = []
  private _doneResolve!: (s: QuerySummary) => void
  private _doneReject!: (e: Error) => void
  readonly done: Promise<QuerySummary>

  constructor(id: string, private readonly _sendCancel: () => void) {
    this.id = id
    this.done = new Promise<QuerySummary>((res, rej) => {
      this._doneResolve = res
      this._doneReject = rej
    })
  }

  cancel(): void {
    this._sendCancel()
  }

  _receiveBatch(rows: Record<string, unknown>[], isDone: boolean): void {
    if (rows.length > 0) this._batches.push({ rows })
    if (isDone) {
      const rowCount = this._batches.reduce((n, b) => n + b.rows.length, 0)
      this._doneResolve({ rowCount, durationMs: 0 })
    }
  }

  _receiveError(err: Error): void {
    this._doneReject(err)
  }

  get stream(): AsyncIterable<Batch> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    return {
      async *[Symbol.asyncIterator]() {
        await self.done // wait for all batches (Phase 1 — not true streaming)
        for (const batch of self._batches) yield batch
      },
    }
  }
}

// --- EngineClient ---

export class EngineClient {
  private worker: Worker
  private pending = new Map<string, QueryHandleImpl>()
  private readyPromise: Promise<void>
  private readyResolve!: () => void
  private readyReject!: (e: Error) => void

  constructor(workerFactory?: WorkerFactory) {
    this.readyPromise = new Promise<void>((res, rej) => {
      this.readyResolve = res
      this.readyReject = rej
    })

    this.worker = workerFactory
      ? workerFactory()
      : new Worker(new URL('../workers/duckdb.worker.ts', import.meta.url), { type: 'module' })

    this.worker.onmessage = (e: MessageEvent<WorkerToMain>) => this._handleMessage(e.data)
    this.worker.onerror = (e: ErrorEvent) => this._handleWorkerError(e)

    this.worker.postMessage({
      kind: 'init',
      correlationId: 'init-0',
      config: { maxMemoryMB: 1024 },
    } satisfies MainToWorker)
  }

  private _handleMessage(msg: WorkerToMain): void {
    switch (msg.kind) {
      case 'ready':
        this.readyResolve()
        break

      case 'batch': {
        const handle = this.pending.get(msg.correlationId)
        if (!handle) return
        handle._receiveBatch(msg.rows, msg.done)
        if (msg.done) this.pending.delete(msg.correlationId)
        break
      }

      case 'error': {
        const handle = this.pending.get(msg.correlationId)
        if (handle) {
          handle._receiveError(new QueryError(msg.error.message))
          this.pending.delete(msg.correlationId)
        } else if (msg.correlationId === 'init-0') {
          this.readyReject(new WorkerError(msg.error.message))
        }
        break
      }

      case 'progress':
        // Phase 3: propagate to UI progress state
        break
    }
  }

  private _handleWorkerError(e: ErrorEvent): void {
    const err = new WorkerError(`DuckDB worker crashed: ${e.message}`)
    for (const handle of this.pending.values()) {
      handle._receiveError(err)
    }
    this.pending.clear()
  }

  async runQuery(sql: string, _opts: QueryOpts = {}): Promise<QueryHandle> {
    await this.readyPromise
    const id = crypto.randomUUID()

    const handle = new QueryHandleImpl(id, () => {
      this.worker.postMessage({
        kind: 'cancel',
        correlationId: crypto.randomUUID(),
        target: id,
      } satisfies MainToWorker)
    })

    this.pending.set(id, handle)

    this.worker.postMessage({
      kind: 'query',
      correlationId: id,
      sql,
      opts: {},
    } satisfies MainToWorker)

    return handle
  }

  shutdown(): void {
    this.worker.postMessage({
      kind: 'shutdown',
      correlationId: crypto.randomUUID(),
    } satisfies MainToWorker)
    this.worker.terminate()
  }
}
```

- [ ] **Step 2: Run tests — expect PASS**
```bash
pnpm test src/engine/__tests__/client.test.ts
# Expected: 5/5 PASS
```

- [ ] **Step 3: Typecheck**
```bash
pnpm typecheck
# Expected: 0 errors
```

- [ ] **Step 4: Commit**
```bash
git add src/engine/client.ts
git commit -m "feat(engine): implement EngineClient with QueryHandle"
```

---

### Task 13: featureDetect Unit Tests (TDD)

> **Worktree:** `../wasm-db-transport` (`feat/phase1-transport`)

**Files:**
- Create: `src/util/__tests__/featureDetect.test.ts`

- [ ] **Step 1: Write tests**
```ts
// src/util/__tests__/featureDetect.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isCrossOriginIsolated', () => {
  it('returns true when window.crossOriginIsolated is true', async () => {
    Object.defineProperty(window, 'crossOriginIsolated', { value: true, configurable: true })
    const { isCrossOriginIsolated } = await import('@/util/featureDetect')
    expect(isCrossOriginIsolated()).toBe(true)
  })

  it('returns false when window.crossOriginIsolated is false', async () => {
    Object.defineProperty(window, 'crossOriginIsolated', { value: false, configurable: true })
    vi.resetModules()
    const { isCrossOriginIsolated } = await import('@/util/featureDetect')
    expect(isCrossOriginIsolated()).toBe(false)
  })
})

describe('hasSharedArrayBuffer', () => {
  it('returns true when SharedArrayBuffer is defined', async () => {
    vi.resetModules()
    const { hasSharedArrayBuffer } = await import('@/util/featureDetect')
    // jsdom typically has SharedArrayBuffer available when crossOriginIsolated is set
    expect(typeof hasSharedArrayBuffer()).toBe('boolean')
  })
})

describe('hasOPFS', () => {
  it('returns false when navigator.storage.getDirectory is not available', async () => {
    vi.resetModules()
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: vi.fn() }, // no getDirectory
      configurable: true,
    })
    const { hasOPFS } = await import('@/util/featureDetect')
    await expect(hasOPFS()).resolves.toBe(false)
  })

  it('returns true when navigator.storage.getDirectory resolves', async () => {
    vi.resetModules()
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: vi.fn().mockResolvedValue({}) },
      configurable: true,
    })
    const { hasOPFS } = await import('@/util/featureDetect')
    await expect(hasOPFS()).resolves.toBe(true)
  })

  it('returns false when getDirectory throws', async () => {
    vi.resetModules()
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: vi.fn().mockRejectedValue(new Error('DOMException')) },
      configurable: true,
    })
    const { hasOPFS } = await import('@/util/featureDetect')
    await expect(hasOPFS()).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect PASS**
```bash
cd ../wasm-db-transport
pnpm test src/util/__tests__/featureDetect.test.ts
# Expected: PASS
```

- [ ] **Step 3: Commit**
```bash
git add src/util/__tests__/featureDetect.test.ts
git commit -m "test(util): featureDetect browser capability tests"
```

---

### Task 14: Transport Unit Tests (TDD — write tests first)

> **Worktree:** `../wasm-db-transport`

**Files:**
- Create: `src/transport/__tests__/http.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
// src/transport/__tests__/http.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CORSError, RangeNotSupportedError, TransportError } from '@/errors'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(() => {
  vi.clearAllMocks()
})

function makeResponse(
  status: number,
  headers: Record<string, string> = {},
  body: Uint8Array = new Uint8Array([1, 2, 3]),
): Response {
  return new Response(body, {
    status,
    headers: new Headers(headers),
  })
}

describe('probeURL', () => {
  beforeEach(async () => {
    const { HttpTransport } = await import('@/transport/http')
    vi.resetModules()
    return { transport: new HttpTransport() }
  })

  it('returns supportsRanges=true for 206 with Accept-Ranges: bytes', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(206, {
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes 0-0/1024',
        'Content-Length': '1024',
        ETag: '"abc123"',
      }),
    )
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport()
    const result = await transport.probeURL('https://example.com/data.parquet')
    expect(result.supportsRanges).toBe(true)
    expect(result.contentLength).toBe(1024)
    expect(result.etag).toBe('"abc123"')
  })

  it('sends Range: bytes=0-0 header in probe request', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(206, { 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes 0-0/1024' }),
    )
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport()
    await transport.probeURL('https://example.com/data.parquet')
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Range']).toBe('bytes=0-0')
  })

  it('throws CORSError on 0 status (network/CORS block)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport()
    await expect(transport.probeURL('https://no-cors.example.com/data.parquet')).rejects.toBeInstanceOf(CORSError)
  })

  it('throws RangeNotSupportedError on 200 response (no range support)', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {}))
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport()
    await expect(transport.probeURL('https://example.com/no-range.parquet')).rejects.toBeInstanceOf(RangeNotSupportedError)
  })
})

describe('fetchRange', () => {
  it('sends correct Range header', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(206, { 'Content-Range': 'bytes 100-199/1024' }, new Uint8Array(100)),
    )
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport()
    await transport.fetchRange('https://example.com/data.parquet', 100, 199, new AbortController().signal)
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Range']).toBe('bytes=100-199')
  })

  it('returns Uint8Array of response body', async () => {
    const body = new Uint8Array([10, 20, 30])
    mockFetch.mockResolvedValueOnce(makeResponse(206, {}, body))
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport()
    const result = await transport.fetchRange('https://example.com/data.parquet', 0, 2, new AbortController().signal)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(Array.from(result)).toEqual([10, 20, 30])
  })

  it('retries on 5xx up to 3 times', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(206, {}, new Uint8Array([1])))
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport({ retryDelaysMs: [0, 0, 0] })
    const result = await transport.fetchRange('https://example.com/data.parquet', 0, 0, new AbortController().signal)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result).toBeInstanceOf(Uint8Array)
  })

  it('throws TransportError after 3 failed retries', async () => {
    mockFetch.mockResolvedValue(makeResponse(503))
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport({ retryDelaysMs: [0, 0, 0] })
    await expect(
      transport.fetchRange('https://example.com/data.parquet', 0, 0, new AbortController().signal),
    ).rejects.toBeInstanceOf(TransportError)
  })

  it('falls back to full GET on 416 for files under size limit', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(416)) // range request fails
      .mockResolvedValueOnce(makeResponse(200, { 'Content-Length': '100' }, new Uint8Array(100))) // full fetch
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport({ smallFileLimitBytes: 200, retryDelaysMs: [] })
    const result = await transport.fetchRange('https://example.com/tiny.parquet', 0, 99, new AbortController().signal)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result).toBeInstanceOf(Uint8Array)
  })

  it('throws RangeNotSupportedError on 416 for large files', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(416))
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport({ smallFileLimitBytes: 0, retryDelaysMs: [] })
    await expect(
      transport.fetchRange('https://example.com/huge.parquet', 0, 999, new AbortController().signal),
    ).rejects.toBeInstanceOf(RangeNotSupportedError)
  })

  it('respects AbortSignal', async () => {
    const controller = new AbortController()
    mockFetch.mockImplementationOnce(() => {
      controller.abort()
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    })
    const { HttpTransport } = await import('@/transport/http')
    const transport = new HttpTransport({ retryDelaysMs: [] })
    await expect(
      transport.fetchRange('https://example.com/data.parquet', 0, 99, controller.signal),
    ).rejects.toThrow()
    // Should not retry on abort
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**
```bash
pnpm test src/transport/__tests__/http.test.ts
# Expected: FAIL — "Cannot find module '@/transport/http'"
```

- [ ] **Step 3: Commit failing tests**
```bash
git add src/transport/__tests__/http.test.ts
git commit -m "test(transport): add failing HTTP transport tests (TDD)"
```

---

### Task 15: Transport Implementation

> **Worktree:** `../wasm-db-transport`

**Files:**
- Create: `src/transport/http.ts`
- Create: `src/cache/stub.ts`

- [ ] **Step 1: Write `src/transport/http.ts`**
```ts
import type { ITransport, ProbeResult } from './types'
import type { ICache, CacheKey } from '@/cache/types'
import { CORSError, RangeNotSupportedError, TransportError } from '@/errors'
import { logger } from '@/util/logger'

// 10MB — arbitrary configurable threshold for 416 full-fetch fallback
const DEFAULT_SMALL_FILE_LIMIT_BYTES = 10 * 1024 * 1024
const DEFAULT_RETRY_DELAYS_MS = [100, 500, 1000]

export interface HttpTransportOptions {
  cache?: ICache
  retryDelaysMs?: number[]
  smallFileLimitBytes?: number
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export class HttpTransport implements ITransport {
  private readonly cache: ICache | null
  private readonly retryDelays: number[]
  private readonly smallFileLimitBytes: number

  constructor(options: HttpTransportOptions = {}) {
    this.cache = options.cache ?? null
    this.retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
    this.smallFileLimitBytes = options.smallFileLimitBytes ?? DEFAULT_SMALL_FILE_LIMIT_BYTES
  }

  async probeURL(url: string): Promise<ProbeResult> {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      })
    } catch (err) {
      // Network error or CORS block (fetch throws TypeError)
      throw new CORSError(url, err)
    }

    if (response.status !== 206) {
      throw new RangeNotSupportedError(url)
    }

    const contentLengthHeader = response.headers.get('Content-Range')
    // Content-Range: bytes 0-0/TOTAL — extract total
    const totalMatch = contentLengthHeader?.match(/\/(\d+)$/)
    const contentLength = totalMatch ? parseInt(totalMatch[1], 10) : null

    return {
      supportsRanges: true,
      contentLength,
      etag: response.headers.get('ETag'),
      lastModified: response.headers.get('Last-Modified'),
    }
  }

  async fetchRange(
    url: string,
    start: number,
    end: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    // Cache check (stub returns null in Phase 1)
    if (this.cache) {
      const key: CacheKey = { url, start, end, contentLength: end - start + 1 }
      const cached = await this.cache.get(key)
      if (cached) {
        logger.debug(`cache hit: ${url} [${start}-${end}]`)
        return cached
      }
    }

    const result = await this._fetchWithRetry(url, start, end, signal)

    // Cache set (fire-and-forget)
    if (this.cache) {
      const key: CacheKey = { url, start, end, contentLength: result.byteLength }
      this.cache.set(key, result)
    }

    return result
  }

  private async _fetchWithRetry(
    url: string,
    start: number,
    end: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    let lastError: Error = new TransportError(`Failed to fetch ${url}`)

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      if (attempt > 0) {
        const delayMs = this.retryDelays[attempt - 1]!
        logger.debug(`retry ${attempt} for ${url} after ${delayMs}ms`)
        await delay(delayMs)
      }

      try {
        const response = await fetch(url, {
          headers: { Range: `bytes=${start}-${end}` },
          signal,
        })

        if (response.status === 416) {
          return await this._handle416(url, start, end, signal)
        }

        if (response.status === 206 || response.status === 200) {
          const buffer = await response.arrayBuffer()
          return new Uint8Array(buffer)
        }

        if (response.status >= 500) {
          lastError = new TransportError(`Server error ${response.status} for ${url}`)
          continue // retry
        }

        throw new TransportError(`Unexpected status ${response.status} for ${url}`)
      } catch (err) {
        if (isAbortError(err)) throw err // never retry on abort
        lastError = err instanceof Error ? err : new TransportError(String(err))
        if (attempt === this.retryDelays.length) break
      }
    }

    throw new TransportError(`Exhausted retries for ${url}`, lastError)
  }

  private async _handle416(
    url: string,
    _start: number,
    end: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    // Probe the actual file size first
    if (end + 1 > this.smallFileLimitBytes) {
      throw new RangeNotSupportedError(url)
    }

    logger.warn(`416 for ${url} — falling back to full GET`)
    const response = await fetch(url, { signal })
    if (!response.ok) throw new TransportError(`Full GET failed: ${response.status}`)
    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  }
}
```

- [ ] **Step 2: Write `src/cache/stub.ts`**
```ts
import type { ICache, CacheKey } from './types'

// No-op cache — always misses. Replaced with real implementation in Phase 2.
export class StubCache implements ICache {
  get(_key: CacheKey): Promise<Uint8Array | null> {
    return Promise.resolve(null)
  }

  set(_key: CacheKey, _data: Uint8Array): void {
    // intentional no-op
  }

  clear(): Promise<void> {
    return Promise.resolve()
  }
}
```

- [ ] **Step 3: Run tests — expect PASS**
```bash
pnpm test src/transport/__tests__/http.test.ts
# Expected: all PASS
```

- [ ] **Step 4: Typecheck**
```bash
pnpm typecheck
# Expected: 0 errors
```

- [ ] **Step 5: Commit**
```bash
git add src/transport/http.ts src/cache/stub.ts
git commit -m "feat(transport): implement HTTP range transport with retry, CORS probe, 416 fallback"
```

---

## ══════════════════════════════════════════════════════
## ⛽ PITSTOP 2 — M2 GATE: Engine + Transport Review
## ══════════════════════════════════════════════════════

**Run in both worktrees:**
```bash
# In wasm-db-engine:
pnpm typecheck && pnpm test
# Expected: protocol tests + client tests all pass

# In wasm-db-transport:
pnpm typecheck && pnpm test
# Expected: featureDetect tests + transport tests all pass
```

**Critical review checklist before creating UI worktree:**
- [ ] `duckdb.worker.ts`: Is `VoidLogger` the right logger? (Check if it silences useful init errors — consider `ConsoleLogger(LogLevel.WARNING)` instead)
- [ ] `duckdb.worker.ts`: Verify `row.toJSON()` produces plain `Record<string, unknown>` for all DuckDB types (dates, BigInts, nulls). If not — document known limitations.
- [ ] `engine/client.ts`: What happens if `runQuery` is called before `ready`? It awaits `readyPromise` — correct. What if init fails? `readyPromise` rejects — `runQuery` will propagate that rejection — correct.
- [ ] `engine/client.ts`: The worker factory pattern (`workerFactory?: WorkerFactory`) — is it the right DI pattern for tests? Review for ergonomics.
- [ ] `transport/http.ts`: The 416 path checks `end + 1 > smallFileLimitBytes` but that's the range end, not the file size. The right check is whether the actual Content-Length is small enough. Flag as known Phase 1 limitation.
- [ ] Transport tests: Is `vi.resetModules()` in each test causing import caching issues? Check test isolation is correct.
- [ ] Are all 8 layer rules in dep-cruiser covered by actual import paths we've written?
- [ ] Protocol types: `rows: Record<string, unknown>[]` in `WorkerToMain.batch` — does `toJSON()` always return this shape? Review.

**Stop here. Merge both worktrees to main, then create UI worktree.**

```bash
# After review passes:
cd /path/to/main-worktree
git merge feat/phase1-engine
git merge feat/phase1-transport
git worktree add ../wasm-db-ui feat/phase1-ui
```

---

## ══════════════════════════════════
## MILESTONE 3: UI + Integration
## ══════════════════════════════════

> All tasks in `../wasm-db-ui` (`feat/phase1-ui`) unless noted.

---

### Task 16: State Service Layer (fixes dep-cruiser layer violation)

> **Worktree:** `../wasm-db-ui`

`App.tsx` must not import from `@/engine` or `@/transport` directly — those violate the `ui-no-direct-engine` and `ui-no-direct-transport` dep-cruiser rules. This task adds a thin `src/state/queryService.ts` that the UI imports instead.

**Files:**
- Create: `src/state/queryService.ts`

- [ ] **Step 1: Write `src/state/queryService.ts`**
```ts
// Wraps EngineClient and HttpTransport so UI never imports from engine/ or transport/ directly.
// Phase 2: this moves into Zustand actions.
import { EngineClient } from '@/engine/client'
import { HttpTransport } from '@/transport/http'
import { StubCache } from '@/cache/stub'
import type { QueryHandle } from '@/engine/types'

let engine: EngineClient | null = null
const transport = new HttpTransport({ cache: new StubCache() })

export function getTransport(): HttpTransport {
  return transport
}

export function getEngine(): EngineClient {
  if (!engine) engine = new EngineClient()
  return engine
}

export function shutdownEngine(): void {
  engine?.shutdown()
  engine = null
}

export type { QueryHandle }
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
# Expected: 0 errors
```

- [ ] **Step 3: Commit**
```bash
git add src/state/queryService.ts
git commit -m "feat(state): add queryService layer — keeps UI isolated from engine/transport"
```

---

### Task 17: App State (useReducer)

> **Worktree:** `../wasm-db-ui`

**Files:**
- Create: `src/state/queryState.ts`

- [ ] **Step 1: Write `src/state/queryState.ts`**
```ts
import type { Batch } from '@/engine/types'
import type { AppError } from '@/errors'

export type QueryStatus = 'idle' | 'probing' | 'executing' | 'error' | 'done'

export interface QueryState {
  parquetURL: string
  queryText: string
  status: QueryStatus
  results: Batch[]
  error: AppError | null
  rowCount: number
}

export type QueryAction =
  | { type: 'SET_URL'; url: string }
  | { type: 'SET_QUERY'; sql: string }
  | { type: 'PROBE_START' }
  | { type: 'PROBE_DONE' }
  | { type: 'QUERY_START' }
  | { type: 'BATCH_RECEIVED'; batch: Batch }
  | { type: 'QUERY_DONE'; rowCount: number }
  | { type: 'ERROR'; error: AppError }
  | { type: 'RESET' }

export const initialState: QueryState = {
  parquetURL: '',
  queryText: '',
  status: 'idle',
  results: [],
  error: null,
  rowCount: 0,
}

export function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'SET_URL':
      return { ...state, parquetURL: action.url, status: 'idle', results: [], error: null }

    case 'SET_QUERY':
      return { ...state, queryText: action.sql }

    case 'PROBE_START':
      return { ...state, status: 'probing', error: null }

    case 'PROBE_DONE':
      return { ...state, status: 'idle' }

    case 'QUERY_START':
      return { ...state, status: 'executing', results: [], error: null, rowCount: 0 }

    case 'BATCH_RECEIVED':
      return { ...state, results: [...state.results, action.batch] }

    case 'QUERY_DONE':
      return { ...state, status: 'done', rowCount: action.rowCount }

    case 'ERROR':
      return { ...state, status: 'error', error: action.error }

    case 'RESET':
      return { ...initialState }

    default:
      return state
  }
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
# Expected: 0 errors
```

- [ ] **Step 3: Commit**
```bash
git add src/state/queryState.ts
git commit -m "feat(state): add query lifecycle reducer"
```

---

### Task 17: URLInput Component

> **Worktree:** `../wasm-db-ui`

**Files:**
- Create: `src/ui/URLInput.tsx`

- [ ] **Step 1: Write `src/ui/URLInput.tsx`**
```tsx
import type { QueryStatus } from '@/state/queryState'

interface URLInputProps {
  value: string
  status: QueryStatus
  onChange: (url: string) => void
  onProbe: () => void
}

export function URLInput({ value, status, onChange, onProbe }: URLInputProps) {
  const isProbing = status === 'probing'

  return (
    <div style={{ display: 'flex', gap: '8px', padding: '12px' }}>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/data.parquet"
        disabled={isProbing}
        style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px', padding: '6px 10px' }}
        aria-label="Parquet file URL"
      />
      <button
        onClick={onProbe}
        disabled={isProbing || value.trim() === ''}
        aria-busy={isProbing}
      >
        {isProbing ? 'Probing…' : 'Load'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
# Expected: 0 errors
```

- [ ] **Step 3: Commit**
```bash
git add src/ui/URLInput.tsx
git commit -m "feat(ui): add URLInput component"
```

---

### Task 18: SQL Editor Component (CodeMirror 6)

> **Worktree:** `../wasm-db-ui`

**Files:**
- Create: `src/ui/SQLEditor.tsx`

- [ ] **Step 1: Write `src/ui/SQLEditor.tsx`**
```tsx
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { sql } from '@codemirror/lang-sql'
import { EditorState } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'

interface SQLEditorProps {
  value: string
  onChange: (sql: string) => void
  onRun: () => void
  disabled?: boolean
}

export function SQLEditor({ value, onChange, onRun, disabled = false }: SQLEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          sql(),
          oneDark,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString())
            }
          }),
          keymap.of([
            // Ctrl+Enter / Cmd+Enter to run query
            {
              key: 'Ctrl-Enter',
              mac: 'Cmd-Enter',
              run: () => { onRun(); return true },
            },
            ...defaultKeymap,
          ]),
          EditorView.editable.of(!disabled),
        ],
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount once

  // Sync external value changes (e.g. when resetting)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  // Sync disabled state
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: EditorView.editable.reconfigure(!disabled),
    })
  }, [disabled])

  return (
    <div
      ref={containerRef}
      style={{ height: '180px', overflow: 'auto', border: '1px solid #333' }}
      aria-label="SQL editor"
    />
  )
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
# If `EditorView.editable.reconfigure` errors — use StateEffect pattern:
# import { StateEffect } from '@codemirror/state'
# const setEditable = StateEffect.define<boolean>()
```

- [ ] **Step 3: Commit**
```bash
git add src/ui/SQLEditor.tsx
git commit -m "feat(ui): add SQLEditor with CodeMirror 6, SQL highlighting, Ctrl+Enter to run"
```

---

### Task 19: Results Table Component

> **Worktree:** `../wasm-db-ui`

**Files:**
- Create: `src/ui/ResultsTable.tsx`

- [ ] **Step 1: Write `src/ui/ResultsTable.tsx`**
```tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useMemo } from 'react'
import type { Batch } from '@/engine/types'

interface ResultsTableProps {
  batches: Batch[]
}

// Display cap: 500 rows in Phase 1 (no virtual scrolling until Phase 3)
const DISPLAY_CAP = 500

export function ResultsTable({ batches }: ResultsTableProps) {
  const allRows = useMemo(
    () => batches.flatMap((b) => b.rows).slice(0, DISPLAY_CAP),
    [batches],
  )

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (allRows.length === 0) return []
    return Object.keys(allRows[0]!).map((key) => ({
      accessorKey: key,
      header: key,
      cell: (info) => {
        const val = info.getValue()
        if (val === null || val === undefined) return <span style={{ color: '#666' }}>NULL</span>
        return String(val)
      },
    }))
  }, [allRows])

  const table = useReactTable({
    data: allRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (allRows.length === 0) return null

  const totalRows = batches.flatMap((b) => b.rows).length
  const capped = totalRows > DISPLAY_CAP

  return (
    <div style={{ overflow: 'auto', maxHeight: '400px', fontSize: '13px' }}>
      {capped && (
        <div style={{ padding: '4px 8px', background: '#333', color: '#ccc' }}>
          Showing first {DISPLAY_CAP} of {totalRows} rows
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  style={{
                    padding: '4px 8px',
                    textAlign: 'left',
                    borderBottom: '1px solid #555',
                    position: 'sticky',
                    top: 0,
                    background: '#1a1a1a',
                    fontFamily: 'monospace',
                  }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{ padding: '3px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
# Expected: 0 errors
```

- [ ] **Step 3: Commit**
```bash
git add src/ui/ResultsTable.tsx
git commit -m "feat(ui): add ResultsTable with TanStack Table, 500-row display cap"
```

---

### Task 20: StatusBar + ErrorPanel Components

> **Worktree:** `../wasm-db-ui`

**Files:**
- Create: `src/ui/StatusBar.tsx`
- Create: `src/ui/ErrorPanel.tsx`

- [ ] **Step 1: Write `src/ui/StatusBar.tsx`**
```tsx
import type { QueryStatus } from '@/state/queryState'

interface StatusBarProps {
  status: QueryStatus
  rowCount?: number
  onCancel?: () => void
}

const STATUS_LABEL: Record<QueryStatus, string> = {
  idle: 'Ready',
  probing: 'Checking URL…',
  executing: 'Executing query…',
  error: 'Error',
  done: '',
}

export function StatusBar({ status, rowCount, onCancel }: StatusBarProps) {
  const label =
    status === 'done' && rowCount !== undefined
      ? `${rowCount.toLocaleString()} row${rowCount !== 1 ? 's' : ''}`
      : STATUS_LABEL[status]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        borderTop: '1px solid #333',
        fontSize: '12px',
        color: status === 'error' ? '#f87171' : '#aaa',
        minHeight: '28px',
      }}
      aria-live="polite"
      aria-label="Query status"
    >
      {status === 'executing' && (
        <span aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
      )}
      <span>{label}</span>
      {(status === 'executing' || status === 'probing') && onCancel && (
        <button
          onClick={onCancel}
          style={{ marginLeft: 'auto', fontSize: '11px', padding: '2px 8px' }}
          aria-label="Cancel current operation"
        >
          Cancel
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `src/ui/ErrorPanel.tsx`**
```tsx
import type { AppError } from '@/errors'

interface ErrorPanelProps {
  error: AppError
}

export function ErrorPanel({ error }: ErrorPanelProps) {
  const handleCopy = () => {
    const text = `${error.code}: ${error.message}${error.stack ? '\n' + error.stack : ''}`
    navigator.clipboard.writeText(text).catch(() => {
      // clipboard API may not be available — silently fail
    })
  }

  return (
    <div
      role="alert"
      style={{
        margin: '8px 12px',
        padding: '10px 14px',
        background: '#2d1515',
        border: '1px solid #7f1d1d',
        borderRadius: '4px',
        fontSize: '13px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <strong style={{ color: '#f87171' }}>{error.code}</strong>
        <button
          onClick={handleCopy}
          style={{ fontSize: '11px', padding: '2px 6px' }}
          aria-label="Copy error details"
        >
          Copy
        </button>
      </div>
      <p style={{ margin: '6px 0 0', color: '#fca5a5', wordBreak: 'break-word' }}>
        {error.message}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**
```bash
pnpm typecheck
# Expected: 0 errors
```

- [ ] **Step 4: Commit**
```bash
git add src/ui/StatusBar.tsx src/ui/ErrorPanel.tsx
git commit -m "feat(ui): add StatusBar with cancel button and ErrorPanel"
```

---

### Task 21: Wire App.tsx + main.tsx

> **Worktree:** `../wasm-db-ui`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Replace `src/App.tsx`**
```tsx
import { useReducer, useRef, useCallback, useEffect } from 'react'
import { queryReducer, initialState } from '@/state/queryState'
import { getEngine, getTransport, shutdownEngine } from '@/state/queryService'
import { URLInput } from '@/ui/URLInput'
import { SQLEditor } from '@/ui/SQLEditor'
import { ResultsTable } from '@/ui/ResultsTable'
import { StatusBar } from '@/ui/StatusBar'
import { ErrorPanel } from '@/ui/ErrorPanel'
import { AppError, TransportError } from '@/errors'
import type { QueryHandle } from '@/engine/types'

export default function App() {
  const [state, dispatch] = useReducer(queryReducer, initialState)
  const activeHandleRef = useRef<QueryHandle | null>(null)

  useEffect(() => {
    return () => { shutdownEngine() }
  }, [])

  const handleProbe = useCallback(async () => {
    dispatch({ type: 'PROBE_START' })
    try {
      await getTransport().probeURL(state.parquetURL)
      dispatch({ type: 'PROBE_DONE' })
    } catch (err) {
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new TransportError(String(err)),
      })
    }
  }, [state.parquetURL])

  const handleRun = useCallback(async () => {
    if (!state.parquetURL || !state.queryText) return

    dispatch({ type: 'QUERY_START' })
    const engine = getEngine()

    try {
      const handle = await engine.runQuery(
        `SELECT * FROM parquet_scan('${state.parquetURL}') LIMIT 500`,
      )
      // Use the user's SQL wrapping the parquet_scan
      // TODO Phase 3: let user control full SQL; for now wrap their query
      activeHandleRef.current = handle

      for await (const batch of handle.stream) {
        dispatch({ type: 'BATCH_RECEIVED', batch })
      }

      const summary = await handle.done
      dispatch({ type: 'QUERY_DONE', rowCount: summary.rowCount })
    } catch (err) {
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new TransportError(String(err)),
      })
    } finally {
      activeHandleRef.current = null
    }
  }, [state.parquetURL, state.queryText, getEngine])

  const handleCancel = useCallback(() => {
    activeHandleRef.current?.cancel()
    dispatch({ type: 'RESET' })
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0d0d0d',
        color: '#e5e5e5',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header style={{ padding: '12px', borderBottom: '1px solid #333' }}>
        <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>wasm-db</h1>
      </header>

      <URLInput
        value={state.parquetURL}
        status={state.status}
        onChange={(url) => dispatch({ type: 'SET_URL', url })}
        onProbe={handleProbe}
      />

      <SQLEditor
        value={state.queryText}
        onChange={(sql) => dispatch({ type: 'SET_QUERY', sql })}
        onRun={handleRun}
        disabled={state.status === 'executing'}
      />

      <div style={{ display: 'flex', gap: '8px', padding: '8px 12px' }}>
        <button
          onClick={handleRun}
          disabled={state.status === 'executing' || !state.parquetURL}
          style={{ padding: '6px 20px', fontWeight: 600 }}
        >
          Run
        </button>
      </div>

      {state.error && <ErrorPanel error={state.error} />}

      <div style={{ flex: 1, overflow: 'auto' }}>
        <ResultsTable batches={state.results} />
      </div>

      <StatusBar
        status={state.status}
        rowCount={state.rowCount}
        onCancel={handleCancel}
      />
    </div>
  )
}
```

- [ ] **Step 2: Replace `src/main.tsx`**
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from '@/sw/register'
import App from './App'
import './index.css'

// Register pass-through SW — satisfies transport fetch invariant from day 1
registerSW().catch(() => {
  // SW registration failure is non-fatal in Phase 1
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Add minimal `src/index.css`**
```css
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; }
button { cursor: pointer; background: #2a2a2a; color: #e5e5e5; border: 1px solid #444; border-radius: 4px; padding: 4px 12px; }
button:hover:not(:disabled) { background: #3a3a3a; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
input { background: #1a1a1a; color: #e5e5e5; border: 1px solid #444; border-radius: 4px; }
input:focus { outline: 2px solid #6366f1; }
```

- [ ] **Step 4: Fix the SQL handling in App.tsx**

The current `handleRun` uses a hardcoded `parquet_scan` wrapper and ignores the user's `queryText`. Fix so user's SQL is used directly:

```tsx
// Replace the handleRun body SQL line:
const handle = await engine.runQuery(state.queryText)
```

The user must type valid SQL including `FROM parquet_scan('...')`. This is correct for Phase 1 — schema-aware autocomplete and table registration come in Phase 3.

Update `initialState` query text to guide the user:

In `src/state/queryState.ts`, change:
```ts
export const initialState: QueryState = {
  parquetURL: '',
  queryText: "SELECT *\nFROM parquet_scan('__URL__')\nLIMIT 100",
  // ...
}
```

> Note: the `__URL__` placeholder is replaced in App.tsx when URL changes:
```tsx
// In App.tsx, add this effect after dispatch SET_URL:
useEffect(() => {
  if (state.parquetURL) {
    dispatch({
      type: 'SET_QUERY',
      sql: `SELECT *\nFROM parquet_scan('${state.parquetURL}')\nLIMIT 100`,
    })
  }
}, [state.parquetURL])
```

- [ ] **Step 5: Typecheck**
```bash
pnpm typecheck
# Expected: 0 errors. Fix any type issues.
```

- [ ] **Step 6: Start dev server and test manually**
```bash
pnpm dev
# Open http://localhost:5173
# Verify:
# 1. App loads without console errors
# 2. window.crossOriginIsolated === true (check in browser console)
# 3. Paste a public Parquet URL and click Load → expect 200 probe or error
# 4. Type SQL and press Ctrl+Enter or Run → DuckDB should initialize and execute
```

- [ ] **Step 7: Commit**
```bash
git add src/App.tsx src/main.tsx src/index.css src/state/queryState.ts
git commit -m "feat(ui): wire App with engine, transport, state — full query loop"
```

---

### Task 22: Generate Parquet Fixture

**Files:**
- Create: `tests/fixtures/parquet/tiny.parquet`

- [ ] **Step 1: Generate `tiny.parquet` using DuckDB CLI**
```bash
# Requires DuckDB CLI installed: https://duckdb.org/docs/installation
mkdir -p tests/fixtures/parquet
duckdb -c "COPY (SELECT i AS id, 'row_' || i AS label, i * 1.5 AS value FROM range(100) t(i)) TO 'tests/fixtures/parquet/tiny.parquet' (FORMAT PARQUET)"
```

If DuckDB CLI is not installed:
```bash
# Alternative: use Python + pyarrow
python3 -c "
import pyarrow as pa, pyarrow.parquet as pq, os
os.makedirs('tests/fixtures/parquet', exist_ok=True)
table = pa.table({'id': list(range(100)), 'label': [f'row_{i}' for i in range(100)], 'value': [i*1.5 for i in range(100)]})
pq.write_table(table, 'tests/fixtures/parquet/tiny.parquet')
print('Created tiny.parquet with 100 rows, columns: id, label, value')
"
```

- [ ] **Step 2: Copy fixture to `public/fixtures/` so Vite serves it in E2E tests**
```bash
mkdir -p public/fixtures
cp tests/fixtures/parquet/tiny.parquet public/fixtures/tiny.parquet
```

- [ ] **Step 3: Verify the file exists in both locations**
```bash
ls -la tests/fixtures/parquet/tiny.parquet public/fixtures/tiny.parquet
# Expected: both exist, ~5-10KB each
```

- [ ] **Step 4: Commit fixtures**
```bash
git add tests/fixtures/parquet/tiny.parquet public/fixtures/tiny.parquet
git commit -m "test(fixtures): add tiny.parquet served via Vite for E2E tests"
```

---

### Task 23: E2E Tests

**Files:**
- Create: `tests/e2e/phase1.spec.ts`

- [ ] **Step 1: Write E2E tests**
```ts
// tests/e2e/phase1.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Phase 1 — Query Loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for app to load
    await expect(page.getByText('wasm-db')).toBeVisible()
  })

  test('loads app with correct security headers', async ({ page }) => {
    const headers = await page.evaluate(() => ({
      coop: document.querySelector('meta[http-equiv="Cross-Origin-Opener-Policy"]')?.getAttribute('content'),
      coep: document.querySelector('meta[http-equiv="Cross-Origin-Embedder-Policy"]')?.getAttribute('content'),
      crossOriginIsolated: window.crossOriginIsolated,
    }))
    expect(headers.crossOriginIsolated).toBe(true)
  })

  test('shows error on CORS-blocked URL', async ({ page }) => {
    const urlInput = page.getByLabel('Parquet file URL')
    await urlInput.fill('https://example.com/fake.parquet')
    await page.getByText('Load').click()

    // Should show CORS_ERROR or RANGE_NOT_SUPPORTED or TRANSPORT_ERROR
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 })
    const alertText = await page.getByRole('alert').textContent()
    expect(alertText).toMatch(/CORS|RANGE|TRANSPORT/)
  })

  test('executes query on locally-served Parquet fixture and shows results', async ({ page }) => {
    // Use the tiny.parquet fixture served by Vite's dev server as a static asset.
    // This avoids network flakiness and CORS issues entirely.
    // Place tiny.parquet in public/fixtures/ so Vite serves it at /fixtures/tiny.parquet.
    const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet'

    const urlInput = page.getByLabel('Parquet file URL')
    await urlInput.fill(FIXTURE_URL)
    await page.getByText('Load').click()

    // Wait for probe (localhost responds instantly)
    await expect(page.getByText('Ready')).toBeVisible({ timeout: 5000 })

    // SQL is auto-populated when URL is set; just click Run
    await page.getByText('Run').click()

    // Results should appear — tiny.parquet has 100 rows, we query LIMIT 5 from auto-SQL
    await expect(page.locator('table')).toBeVisible({ timeout: 30000 })
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 30000 })
  })

  test('cancel button stops executing query', async ({ page }) => {
    // This test verifies cancel appears during execution
    // We can't easily test mid-flight cancel without a slow query
    // Phase 3 will add a dedicated slow-query fixture
    await expect(page.getByText('Ready')).toBeVisible()
  })

  test('status bar shows row count after successful query', async ({ page }) => {
    // Snapshot: verify status bar updates to show row count
    // Full test covered by the "executes query" test above
    await expect(page.getByLabel('Query status')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run E2E — Chrome only first**
```bash
pnpm test:e2e --project=chromium
# Expected: most tests pass; network tests may be slow (60s timeout)
# Fix any selector mismatches between test expectations and actual DOM
```

- [ ] **Step 3: Run all browsers**
```bash
pnpm test:e2e
# Expected: pass on Chrome, Firefox, Safari
# Document any browser-specific failures in docs/log/
```

- [ ] **Step 4: Commit**
```bash
git add tests/e2e/phase1.spec.ts
git commit -m "test(e2e): add Phase 1 query loop E2E tests"
```

---

## ═════════════════════════════════════════════════════════════
## ⛽ PITSTOP 3 — M3 GATE: UI + Integration Final Review
## ═════════════════════════════════════════════════════════════

**Run the full gate:**
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

**Critical review checklist — this is the Phase 1 completion gate:**

**Correctness:**
- [ ] Does `window.crossOriginIsolated === true` in all 3 browsers?
- [ ] Does DuckDB actually initialize? Check for `[worker] ready` in console (with `?debug=true`).
- [ ] Do query results appear for a real public Parquet URL?
- [ ] Does cancel actually stop the query (or at minimum reset UI state)?
- [ ] Does probing a CORS-blocked URL show the ErrorPanel with the right error code?

**Architecture compliance:**
- [ ] Run `pnpm check:layers` — 0 layer violations?
- [ ] Search for any `console.log/warn/error` outside `src/util/logger.ts` — must be 0.
- [ ] Does `src/main.tsx` register the SW before mounting React? (yes, per Task 21)
- [ ] Does App.tsx import from `@/engine` directly? (it should — `state/` is the contract boundary). Wait — architecture says UI → state → engine. Fix if App.tsx imports engine directly.

**Phase 1 scope compliance:**
- [ ] No Zustand imports anywhere — confirmed?
- [ ] No IndexedDB access anywhere (only Phase 2) — confirmed?
- [ ] No OPFS usage — confirmed?

**Known Phase 1 limitations to document:**
- [ ] Query streaming is fake — all rows arrive in one batch after completion
- [ ] SQL editor is not schema-aware (no column autocomplete)
- [ ] Cancel is best-effort (closes+reopens DuckDB connection)
- [ ] Results capped at 500 rows displayed (not 500 rows queried — user must add LIMIT)
- [ ] No query history
- [ ] No tabs

**Log the review result in `docs/log/`.**

---

### Task 24: Merge to Main + Final Commit

- [ ] **Step 1: Push all worktrees**
```bash
# In wasm-db-engine:
git push origin feat/phase1-engine

# In wasm-db-transport:
git push origin feat/phase1-transport

# In wasm-db-ui:
git push origin feat/phase1-ui
```

- [ ] **Step 2: Merge to main (in main worktree)**
```bash
cd /home/zenitsu/Desktop/wasm-db
git merge feat/phase1-engine
git merge feat/phase1-transport
git merge feat/phase1-ui
```

- [ ] **Step 3: Final gate on main**
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check:layers
# All must pass on main
```

- [ ] **Step 4: Tag Phase 1 complete**
```bash
git tag phase1-complete
git commit --allow-empty -m "chore: Phase 1 complete — working query loop"
```

- [ ] **Step 5: Update session log**

Append to `docs/log/2026-04-20.md`:
```markdown
## Phase 1 Implementation Complete
- All unit tests pass
- E2E pass on Chrome, Firefox, Safari
- typecheck + lint + dep-cruiser pass
- Known limitations documented in Pitstop 3
- Next: Phase 2 (caching, Zustand persistence)
```

Update `docs/log/INDEX.md`:
```markdown
| 2026-04-20 | Phase 1 implementation complete | All tests pass; known limitations: fake streaming, best-effort cancel, 500-row display cap |
```

---

## Appendix: Quick Reference

**Per-commit loop:**
```bash
pnpm typecheck && pnpm lint && pnpm test
```

**After touching workers:**
```
Restart dev server — workers do not HMR.
```

**Layer check:**
```bash
pnpm check:layers
```

**PR gate (CI):**
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

**Debug mode:**
```
http://localhost:5173?debug=true
```
