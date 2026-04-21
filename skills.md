# Skills for wasm-db — Curated Recommendations

A UX-intensive in-browser analytical engine needs: **(a)** strong generated-UI taste,
**(b)** a11y and visual verification baked into the workflow, **(c)** disciplined
TDD/debug/plan loops for the cross-browser gnarliness, and **(d)** a small set of
*project-specific* skills encoding the weirder invariants in your SPEC.

This doc maps each of those needs to concrete skills, ranks them by fit, and ends with
the custom skills you should author yourself. Keep it in `docs/agent/skills.md` and
reference it from `CLAUDE.md`.

> Reminder on the mechanics: skills are folders with a `SKILL.md` whose YAML frontmatter
> (`name` + `description`) is auto-loaded (~100 tokens per skill). The body loads only when
> Claude decides the task matches. Ten well-targeted skills cost essentially nothing at
> idle. A hundred loosely-scoped ones force Claude to spend attention picking.

---

## The Curated Starter Pack — install these first

These seven cover the UX-intensive path end-to-end without overlapping much.

| # | Skill | Source | Why it earns its slot |
|---|---|---|---|
| 1 | **frontend-design** | `anthropics/skills` | Kills the "AI slop" aesthetic. Your SQL editor, schema tree, and results grid all have to feel crafted, not generated. |
| 2 | **webapp-testing** | `anthropics/skills` | Playwright-driven visual verification. Mandatory given your cross-browser verification commands. |
| 3 | **superpowers** (bundle) | `obra/superpowers` | TDD, systematic-debugging, brainstorming, write-plan, execute-plan, verification-before-completion. The core discipline for a project where untested code bites in specific browsers three weeks later. |
| 4 | **skill-creator** | `anthropics/skills` | You'll be authoring the project-specific skills below; this one runs the TDD loop for the skills themselves. |
| 5 | **a11y-self-check** | `naporin0624/a11y-self-check` | Proactively validates generated JSX/TSX *before* presenting it. Cheapest a11y win. |
| 6 | **web-design-guidelines** | `vercel-labs/agent-skills` | 100+ rules, ARIA/focus/semantic HTML — a linter-style quality gate, complements frontend-design's creative side. |
| 7 | **shadcn/ui skill** | `ui.shadcn.com/docs/skills` | *Only if you adopt shadcn.* Reads your `components.json` and generates correct first-try code. Skip otherwise. |

Stop here if you want a lean setup. Everything below is additive.

---

## Official Anthropic Skills — `github.com/anthropics/skills`

Install via `/plugin marketplace add anthropics/skills` then pick `example-skills` or
individual plugins.

### Strongly recommended for wasm-db

**frontend-design** — Production-grade frontend with distinctive aesthetic. Bans generic
fonts (Inter/Roboto/Arial), purple gradients, uniform rounded cards. Forces intentional
choices for typography, color, motion, composition *before* any code is written. For a
SQL editor / schema tree / results grid where visual hierarchy matters, this is the
single highest-leverage skill.
→ *Maps to SPEC §8.1 (editor), §8.2 (schema), §8.3 (progressive feedback).*

**webapp-testing** — Playwright "reconnaissance-then-action" pattern (wait for
networkidle → screenshot → identify selectors → execute). Your cross-browser testing
matrix (SPEC §10.3) is non-trivial; this skill gives Claude the right mental model.
→ *Maps to SPEC §10.3, and to your CLAUDE.md `pnpm test:e2e` workflow.*

**skill-creator** — Interactive skill authoring with a TDD-for-skills loop (run test
prompts with/without the skill in parallel, grade, iterate). Use this to build the
project-specific skills in the last section of this doc.

### Useful depending on stack choices

**web-artifacts-builder** — React + Tailwind + shadcn/ui component composition. Only
install if building standalone artifact demos; for a full Vite app it's partly redundant
with your own conventions.

**brand-guidelines** — Template showing how Anthropic encodes its own brand tokens. Don't
install as-is (it applies Anthropic's colors); *do* fork the structure if/when you want a
`wasm-db-brand` skill that encodes your typography and color tokens.

### Skip for this project

`mcp-builder` (you're not building an MCP server), `claude-api` (you're not integrating
Claude), `doc-coauthoring` (doc workflow, not app code), `internal-comms`,
`algorithmic-art`, `canvas-design`, `theme-factory`, `docx`/`pdf`/`pptx`/`xlsx`.

---

## Community Skills

### obra/superpowers ⭐ must-install

Install: `/plugin marketplace add obra/superpowers-marketplace` then
`/plugin install superpowers@superpowers-marketplace`.

Not a single skill but a methodology bundle. The ones that matter for you:

- **brainstorming** — Socratic interview before writing code. Stops Claude from
  diving in on an ambiguous request and inventing requirements.
- **writing-plans** / **executing-plans** — Turns a brief into a detailed TDD plan, then
  runs it in batches with review checkpoints. For a multi-week project, this is how you
  get Claude to actually build what's in the SPEC, not something adjacent.
- **test-driven-development** — Strict RED-GREEN-REFACTOR. Given your invariants live in
  tests (layer direction, reload-safety, range coalescing), this enforces that new
  behaviour starts with a failing test.
- **systematic-debugging** — Four-phase root-cause process. Invaluable when a Safari
  eviction bug reproduces locally once every 40 sessions.
- **verification-before-completion** — Blocks "I'm done" claims until verification
  commands actually pass. Your CLAUDE.md has a numbered verification list; this skill
  forces it.
- **using-git-worktrees** — Isolated workspace per task. Practical for parallel UI work
  vs. transport changes vs. cache refactors.

### Accessibility

Your error panel, keyboard-driven editor, and results grid all need serious a11y work.
Install *one* proactive + *one* auditor, not all of them:

| Skill | Mode | When |
|---|---|---|
| **naporin0624/a11y-self-check** | Proactive — validates JSX/TSX before presenting it | ⭐ Default. Cheapest to run continuously. |
| **snapsynapse/skill-a11y-audit** | On-demand WCAG 2.1 AA audit with sitemap-aware sampling | Periodic full audit. Auto-installs axe-core + Puppeteer. |
| **airowe/claude-a11y-skill** | axe-core runtime + jsx-a11y static | Alternative to the above; simpler setup, React-first. |
| **Community-Access/accessibility-agents** | 79 specialists across eight teams | Overkill for most projects. Worth knowing exists. |
| **accesslint/claude-marketplace** | Contrast-checker, refactor, use-of-color, link-purpose (bundled MCP) | Install if your contrast testing is currently manual. |

### Frontend / Design quality

- **vercel-labs/agent-skills** — `web-design-guidelines` (100+ UX/a11y/perf rules, fetched
  live) and `react-best-practices` (57 perf rules). Quality-gate oriented, complements
  frontend-design's taste-forward approach. ⭐
- **nextlevelbuilder/ui-ux-pro-max-skill** — Largest community design skill. Searchable
  database: 67 UI styles, 161 palettes, 57 font pairings, 99 UX guidelines, 25 chart
  types across 9 stacks. Useful when you want varied design references; potentially noisy
  if you already know your aesthetic. Optional.
- **jezweb/claude-skills/design-review** — Visual design quality review skill trained
  on specific designers (motion, typography, layout). Useful review pass before shipping.
- **jezweb/claude-skills/tailwind-theme-builder** — If you use Tailwind v4 with `@theme`.

### Browser automation / Playwright

If you want something lighter or different from `webapp-testing`:

- **lackeyjb/playwright-skill** — Model-invoked, writes custom Playwright on-the-fly per
  task. Good for exploratory UI validation, not for a formal test suite.
- **secondsky/claude-skills/playwright** — Auto-detects dev servers, writes clean scripts.
  Particularly good for responsive viewport testing.

### Charts / data visualisation

Nothing great matches "results grid + schema tree + query cost visualisation" out of the
box. You're better off authoring this yourself (see Custom Skills below). Two starting
points if you want external references:

- `ui-ux-pro-max` has 25 chart-type references.
- For the query-cost color bar specifically, `web-design-guidelines` covers
  meaningful-color-use and contrast requirements.

---

## Custom Skills to Author — the ones that matter most

These encode your SPEC's non-obvious invariants. Generated skills won't cover these, and
CLAUDE.md shouldn't inline them (context cost). Each gets its own folder under
`.claude/skills/` with a 5–20-line SKILL.md body plus any helper scripts.

Use `skill-creator` to build these with the TDD loop; the sketches below are starting
points.

### 1. `duckdb-worker-protocol`

**Trigger**: user asks to add, modify, or remove a message type between main thread
and DuckDB worker; touching `src/workers/protocol.ts` or `src/engine/client.ts`.

**Body**: enforces the mandatory 4-step order — (1) add union variant to `protocol.ts`,
(2) handle in `duckdb.worker.ts`, (3) add caller in `engine/client.ts`, (4) add
round-trip test. Includes a code template for the variant shape with `correlationId`.
Warns that workers do not HMR; dev server restart required.

### 2. `progressive-feedback-ui`

**Trigger**: UI changes involving queries, fetches, or any operation >200ms; new loading
states; anywhere a spinner would appear.

**Body**: enforces SPEC §8.3 — every long operation renders (a) *what* is happening with
specifics (not "loading…"), (b) current progress where measurable ("row group 2 of 7"),
(c) estimated time remaining if estimable, (d) a visible cancel control wired to an
`AbortController`. Flags skeletons-without-progress and bare spinners as violations.

### 3. `duckdb-error-translation`

**Trigger**: surfacing any DuckDB or transport error to the UI; adding a new error
pathway; touching `src/engine/errorMap.ts` or `src/ui/errorMessages.ts`.

**Body**: maps raw DuckDB errors to user-friendly messages per SPEC §8.4. Includes the
pattern:
`Binder Error: Column "x" not found` → include available columns + did-you-mean using
Levenshtein on schema names. Requires a test case for every new error mapping. Blocks
PRs that pass raw DuckDB strings to React.

### 4. `cache-invariants`

**Trigger**: any file under `src/cache/`; changing chunker behaviour; adding a new cache
tier; Dexie schema changes.

**Body**: loads `@docs/agent/caching.md`, adds skill-level enforcement: Firefox 2MB
chunker is not bypassable; cache keys must include URL + range + ETag/Last-Modified/CL;
LRU eviction runs on `QuotaExceededError`; footer cache is exempt from quota prune.
Flags direct Dexie writes outside `src/cache/`.

### 5. `reload-safety-check`

**Trigger**: adding state; modifying Zustand stores; anywhere `useState` or `useReducer`
holds app-meaningful state.

**Body**: enforces SPEC §2.2 — new state is either persisted via Zustand `persist` or
encoded in a URL param, or explicitly documented as ephemeral with justification. Runs
`pnpm test:reload` in verification. Rejects hidden state in React component locals for
anything a user would expect back on reload.

### 6. `query-cost-estimation-ui`

**Trigger**: anything rendering a cost estimate, bytes-scanned display, or the
run/confirm flow.

**Body**: SPEC §8.5 — green <50MB, yellow 50–200MB, red >200MB, confirmation dialog
required for red. Provides the semantic color token names and the confirmation modal
component reference. Flags numeric-only displays without the color band.

### 7. `range-request-debugging`

**Trigger**: CORS errors, 416 responses, retry loops, circuit-breaker fires, anything in
`src/transport/`.

**Body**: diagnostic checklist in priority order — (a) `Accept-Ranges: bytes`, (b)
`Access-Control-Allow-Origin`, (c) `Content-Length` consistency, (d) ETag stability
across CDN edges, (e) suffix-range support for footer. Points to
`tests/fixtures/cors-broken/` for repro. Includes the retry-backoff schedule.

### 8. `parquet-fixture-adder`

**Trigger**: adding test coverage for new transport or cache behaviour; new row-group
edge cases; schema drift testing.

**Body**: how to generate a minimal Parquet fixture using DuckDB's Python or CLI,
where to place it (`tests/fixtures/parquet/`), how the mock CDN server serves it, naming
conventions (`tiny.parquet`, `chunked.parquet`, `signed/`, `cors-broken/`). Forces a
fixture-per-behaviour rule over live URLs in tests.

### 9. `sql-editor-conventions`

**Trigger**: touching `src/ui/editor/`; CodeMirror 6 configuration; autocomplete
sources; keybindings.

**Body**: the extensions you use, how autocomplete pulls from cached schema, how history
persists through Zustand, which keybindings are reserved for host-app vs. editor. Flags
direct DOM manipulation of the editor DOM as anti-pattern.

---

## Installing & organising

### File layout for this repo

```
.claude/
  skills/                          # Project-scoped skills (team-shared)
    duckdb-worker-protocol/
      SKILL.md
    progressive-feedback-ui/
      SKILL.md
    ...                            # The other custom skills above
~/.claude/
  skills/                          # Personal skills (not in repo)
    frontend-design/               # From anthropics/skills
    webapp-testing/
    superpowers/                   # Meta, contains many skills
    a11y-self-check/
    web-design-guidelines/
```

Project-scoped skills go in `.claude/skills/` and are committed. Personal skills
(`frontend-design`, Superpowers, etc.) go in `~/.claude/skills/` — each team member
installs what they want. This avoids project repo churn when someone upgrades a skill.

### Add to CLAUDE.md

Append to the references section of the main CLAUDE.md:

```markdown
## Skills

- `.claude/skills/` contains project-specific skills. Catalog and rationale in
  @docs/agent/skills.md.
- Recommended personal skills: frontend-design, webapp-testing, superpowers,
  a11y-self-check, web-design-guidelines. Install per @docs/agent/skills.md.
```

### Skill hygiene

Copied from Jesse Vincent's `writing-skills` guidance:

- **Description must contain triggering conditions, not workflow summary.** "Use when
  adding a new worker message type" is right. "Adds a message by modifying protocol.ts
  then worker.ts then client.ts" is wrong — Claude may follow the description instead of
  reading the body.
- **Be a little pushy.** Claude has a tendency to under-trigger skills. Prefer "Use
  whenever touching `src/cache/`" over "available for caching tasks".
- **Test each skill.** Run a representative task with and without the skill in parallel
  subagents; compare. `skill-creator` automates this.
- **Prune descriptions.** There's a 1,536-character cap per skill in the on-load
  description budget. Front-load the critical-path trigger.

---

## alirezarezvani/claude-skills — the cherry-picked subset

This repo ships 235 skills across 9 domains (engineering, marketing, product, RA/QM,
C-level, finance, PM, business-growth, plus POWERFUL-tier advanced engineering). It's
heavily starred (11k+) and well-structured, but installing the full bundle is a
*mistake* for a focused project like this one. Three reasons:

- **Metadata weight**: ~100 tokens per skill × 235 ≈ 23K tokens of skill metadata loaded
  on every session, before you ask anything. Anthropic's own docs warn that when too
  many skills are present, description budgets get truncated and triggering keywords
  drop out — so even the relevant ones stop firing.
- **Relevance**: the majority (marketing 44, C-level 34, RA/QM 14, PM 9, product 16,
  finance 4, business-growth 5 = 126 skills) has nothing to do with a browser-based
  analytical engine. Every irrelevant skill is noise in the selection step.
- **Trust surface**: skills execute arbitrary code. The repo even ships a
  `skill-security-auditor` to vet skills before install. 235 of those is a lot of
  audit work.

The 12 skills below are the ones that add *net new value* beyond the starter pack
without overlapping it.

### Install these (engineering-team — core)

| Skill | Path | Why it earns its slot here |
|---|---|---|
| **a11y-audit** | `engineering-team/a11y-audit` | WCAG 2.2 scan with a11y_scanner.py + contrast_checker.py. Complements `a11y-self-check` (proactive) with a periodic deep audit. |
| **senior-devops** | `engineering-team/senior-devops` | CI/CD, COOP/COEP deployment nuances, static-host config. Directly relevant to your SPEC §12. |
| **senior-security** | `engineering-team/senior-security` | CORS posture, CSP, signed URL handling. Your SPEC §7 is security-dense. |
| **code-reviewer** | `engineering-team/code-reviewer` | Pre-PR review against plan + standards. Less pushy than superpowers' reviewer; useful as a second pass. |
| **self-improving-agent** | `engineering-team/self-improving-agent` | Auto-memory curation: pattern promotion, skill extraction, memory health. Pairs well with Claude Code's built-in auto-memory for long sessions. |

### Install these (engineering — POWERFUL tier)

| Skill | Path | Why it earns its slot here |
|---|---|---|
| **performance-profiler** | `engineering/performance-profiler` | Node/JS profiling, bundle analysis, load testing. Your cold-start budget and query latency targets need this. |
| **ci-cd-pipeline-builder** | `engineering/ci-cd-pipeline-builder` | Stack detection → GitHub Actions / GitLab CI generation. Sets COOP/COEP, cache headers, WASM content-type correctly. |
| **dependency-auditor** | `engineering/dependency-auditor` | License compliance + upgrade planner. Your 50KB-gzipped dependency gate needs a tool; this is it. |
| **pr-review-expert** | `engineering/pr-review-expert` | Blast-radius analysis, security scan, coverage delta. Useful for worker-protocol or cache-layer PRs where impact isn't local. |
| **changelog-generator** | `engineering/changelog-generator` | Conventional commits → changelog. Your CLAUDE.md already mandates conventional commits; this closes the loop. |
| **release-manager** | `engineering/release-manager` | Semantic version bumper, readiness checker, SW-update flow gating. Relevant to SPEC §12.3 cache-busting. |
| **skill-security-auditor** | `engineering/skill-security-auditor` | Scan any skill for command injection, exfiltration, prompt-injection before install. **Install this one first** — it vets every other skill. |

### Skip from this repo (and why)

- **Whole domains**: marketing/, c-level-advisor/, ra-qm-team/, finance/,
  business-growth/, project-management/, product-team/ — none apply to wasm-db.
- **Engineering skills that don't fit**: `senior-backend` (no backend),
  `senior-fullstack` (no backend half), `senior-data-engineer` / `senior-ml-engineer` /
  `senior-data-scientist` / `senior-computer-vision` / `senior-prompt-engineer`
  (different domains), `aws-/azure-/gcp-solution-architect` (static hosting, not cloud
  infra), `snowflake-development`, `ms365-tenant-manager`, `google-workspace-cli`,
  `epic-design`, `security-pen-testing` (not your threat model).
- **POWERFUL tier that doesn't fit**: `api-design-reviewer`, `api-test-suite-builder`
  (no API), `database-designer`, `database-schema-designer`, `migration-architect` (no
  DB — data is Parquet), `rag-architect`, `agent-designer`, `agent-workflow-designer`
  (not building an agent), `mcp-server-builder` (not building MCP),
  `observability-designer`, `runbook-generator`, `incident-commander` (client-side app,
  no production ops surface), `interview-system-designer`, `monorepo-navigator` (not a
  monorepo), `env-secrets-manager` (no secrets to manage).
- **Overlap with starter-pack**: `senior-frontend` overlaps frontend-design;
  `senior-qa` and `playwright-pro` overlap webapp-testing; `tdd-guide` overlaps
  superpowers' TDD; `adversarial-reviewer` overlaps superpowers' code-reviewer;
  `git-worktree-manager` overlaps superpowers' using-git-worktrees. Pick one side or the
  other, don't install both.

### Install commands (curated subset)

```bash
# Security auditor FIRST — use it to vet everything else
git clone --depth 1 https://github.com/alirezarezvani/claude-skills.git /tmp/ars
cp -r /tmp/ars/engineering/skill-security-auditor ~/.claude/skills/

# Audit each skill before installing it
python3 ~/.claude/skills/skill-security-auditor/scripts/skill_security_auditor.py \
  /tmp/ars/engineering-team/a11y-audit

# Then copy the 12 you actually want
for skill in engineering-team/a11y-audit engineering-team/senior-devops \
             engineering-team/senior-security engineering-team/code-reviewer \
             engineering-team/self-improving-agent \
             engineering/performance-profiler engineering/ci-cd-pipeline-builder \
             engineering/dependency-auditor engineering/pr-review-expert \
             engineering/changelog-generator engineering/release-manager; do
  cp -r /tmp/ars/$skill ~/.claude/skills/
done

rm -rf /tmp/ars
ls ~/.claude/skills/
```

Or via the plugin marketplace if you prefer (though this installs bundles, which brings
the skills you skipped):

```bash
/plugin marketplace add alirezarezvani/claude-skills
/plugin install engineering-skills@claude-code-skills          # includes some skips
/plugin install engineering-advanced-skills@claude-code-skills # includes some skips
# Uninstall the ones in the "Skip" list above after:
/plugin list
```

### If you really want all 235

I strongly recommend against it for the reasons above, but if you want to override:

```bash
/plugin marketplace add alirezarezvani/claude-skills
/plugin install engineering-skills@claude-code-skills
/plugin install engineering-advanced-skills@claude-code-skills
/plugin install product-skills@claude-code-skills
/plugin install marketing-skills@claude-code-skills
/plugin install ra-qm-skills@claude-code-skills
/plugin install pm-skills@claude-code-skills
/plugin install c-level-skills@claude-code-skills
/plugin install business-growth-skills@claude-code-skills
/plugin install finance-skills@claude-code-skills
```

Expect slower session starts, less reliable skill triggering, and Claude occasionally
considering whether the C-level advisor persona should weigh in on your range-request
retry logic. You've been warned.

---

## Other skip recommendations

- **Other generic "awesome" collections** (`antigravity-awesome-skills` at 1,234+
  skills, sweeping community bundles): same reasoning as above.
- **Document skills** (docx/pdf/pptx/xlsx): you're not generating Office files.
- **Figma-based design pipelines**: no Figma in this workflow.
- **Skills that require cloud credentials or external services you haven't committed
  to**: every new dependency is a trust boundary. Install only from sources you'd trust
  with shell access.

---

## Quick reference — install commands

```bash
# Official Anthropic
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills          # frontend-design, webapp-testing, skill-creator, etc.

# Superpowers
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace

# shadcn (only if using shadcn/ui)
npx shadcn@latest init --skill                                  # adds skill + components.json

# Community — git clone pattern (read SKILL.md first, skills can run code)
git clone https://github.com/naporin0624/a11y-self-check.git \
  ~/.claude/skills/a11y-self-check
git clone https://github.com/vercel-labs/agent-skills /tmp/vercel-skills
cp -r /tmp/vercel-skills/skills/web-design-guidelines ~/.claude/skills/
cp -r /tmp/vercel-skills/skills/react-best-practices ~/.claude/skills/

# Verify
ls ~/.claude/skills/
ls .claude/skills/
```
