# docs/agent/ — Progressive Disclosure for Claude Code

This folder contains domain-specific deep dives that `CLAUDE.md` references via `@` imports.
They are **not** loaded at session start — Claude Code loads them on demand when the root
`CLAUDE.md` or the current task mentions them.

## Why this split exists

Anthropic's guidance: *"Bloated CLAUDE.md files cause Claude to ignore your actual
instructions."* A 1000-line root file gets skimmed; a 120-line root file with 8 focused
companions gets followed.

Root `CLAUDE.md` = operating manual (always in context).
These files = reference material (loaded when relevant).
`docs/SPEC.md` = product requirements (loaded when deriving new features).

## When to load which file

| If the task touches… | Load |
|---|---|
| Layer boundaries, worker messaging, state shape, reload flow | `architecture.md` |
| `src/cache/`, eviction, quota errors, range coalescing | `caching.md` |
| `src/transport/`, retry, CORS, circuit breaker, Parquet fetch | `transport.md` *(to write)* |
| DuckDB worker config, memory tuning, query cancellation, EXPLAIN | `duckdb.md` *(to write)* |
| COOP/COEP, CDN, versioning, SW update flow | `deployment.md` *(to write)* |
| Share-URL encoding, schema fingerprinting, snapshot mode | `sharing.md` *(to write)* |
| CORS, signed URLs, query sandboxing, result XSS | `security.md` *(to write)* |
| New feature derivation, requirement audit | `../SPEC.md` |
| Scope / phase planning | `../ROADMAP.md` *(to write)* |

## Writing style for these files

- **Imperative and operational.** "Update the LRU logic in `src/cache/policy.ts`", not "the
  system must implement LRU eviction."
- **Reference real filenames and test locations.** If a file doesn't exist yet, say so and
  name where it *will* live. Handwaves like "the cache module" make Claude hallucinate paths.
- **Assume the reader has the root `CLAUDE.md` in context.** Don't re-state invariants
  already there; extend them.
- **Include the "why."** A one-paragraph rationale at the bottom earns its keep — it stops
  future refactors from undoing decisions blindly.
- **Link to concrete tests.** When an invariant is checked by a test, name the test file.
  Agents (and humans) trust tests more than prose.
- **One topic per file.** If a section is starting to feel like a separate concern, split it.

## Maintaining these files

Same rule as the root: *would removing this line cause Claude to make a mistake?* If not,
cut it. When a rule is repeatedly violated, the file is probably too long — factor it
further, or move prescriptive detail back into tests/linters where it can be enforced
mechanically.
