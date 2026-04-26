# Phase 4 Design — URL Sharing, Schema Fingerprint & Drift Warning

**Date**: 2026-04-26  
**Status**: Approved  
**Scope**: Phase 4 of 5  
**Next step**: implementation plan (writing-plans skill)

---

## Goal

Let users share a working Parquet query via a single URL. Opening the link auto-loads the file, restores the SQL, and warns if the schema has changed since the link was created.

**Success bar**: copy URL → paste in a fresh tab → probe fires automatically, SQL is restored, results appear with no user interaction beyond opening the link.

---

## Scope

**In scope:**

- Hash-based URL encoding: `#url=<parquet-url>&q=<sql>&sf=<fingerprint>`
- Share button: builds URL, copies to clipboard, shows "Copied!" feedback
- Auto-probe on load when hash contains `url` param
- Schema fingerprint computation (FNV-1a over column descriptor string)
- Drift detection: compare stored fingerprint from URL vs live schema
- Dismissible drift warning banner

**Explicitly out of scope (deferred):**

- LZ-string compression — URL encoding is sufficient for queries under ~2 KB
- Result snapshot encoding (too large for URL)
- Multi-file sharing
- Server-side short-link / redirect service

---

## URL Format

```
https://app.example.com/#url=https%3A%2F%2F...%2Ffile.parquet&q=SELECT+*+FROM+...&sf=a3f8c21d
```

All params live in the **hash fragment** (never sent to the server — privacy preserved). Encoded with `URLSearchParams`. On load, decoded with `new URLSearchParams(window.location.hash.slice(1))`.

| Param | Content                       | Required      |
| ----- | ----------------------------- | ------------- |
| `url` | Parquet file URL              | yes           |
| `q`   | SQL query text                | no (optional) |
| `sf`  | 8-char hex schema fingerprint | no (optional) |

---

## Architecture

### New files

| File                          | Responsibility                                                    |
| ----------------------------- | ----------------------------------------------------------------- |
| `src/util/sharing.ts`         | `encodeShareURL()`, `decodeShareParams()`, `computeFingerprint()` |
| `src/util/sharing.test.ts`    | Unit tests for all three functions                                |
| `src/ui/ShareButton.tsx`      | Clipboard copy + "Copied!" transient feedback (1.5 s)             |
| `src/ui/ShareButton.test.tsx` | RTL tests                                                         |
| `src/ui/DriftBanner.tsx`      | Dismissible drift warning, prop-driven                            |
| `src/ui/DriftBanner.test.tsx` | RTL tests                                                         |
| `tests/e2e/phase4.spec.ts`    | Share round-trip + drift warning E2E                              |

### Modified files

| File                      | Change                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/state/queryState.ts` | Add `sharedFingerprint: string \| null`, `schemaDrift: boolean`; add `SET_SHARED_FINGERPRINT`, `SCHEMA_DRIFT_DETECTED`, `DISMISS_DRIFT` actions |
| `src/App.tsx`             | Auto-probe on load when hash has `url`; mount `ShareButton` and `DriftBanner`; compare fingerprints after schema loads                          |

---

## Component Breakdown

### `src/util/sharing.ts`

```
computeFingerprint(columns: ColumnInfo[]): string
  → FNV-1a 32-bit hash of "name:TYPE,name:TYPE,..." (column order)
  → return hash.toString(16).padStart(8, '0')   // 8 hex chars

encodeShareURL(parquetURL: string, queryText: string, fingerprint: string | null): string
  → builds URLSearchParams with url, q, sf
  → returns `${window.location.origin}${window.location.pathname}#${params}`

decodeShareParams(hash: string): { url: string | null; query: string | null; fingerprint: string | null }
  → parses hash fragment; validates url scheme is http(s); returns nulls for missing/invalid
```

Pure functions — no side effects, easy to test in isolation.

### `src/ui/ShareButton.tsx`

Props: `{ parquetURL: string; queryText: string; fingerprint: string | null; disabled: boolean }`

Behavior:

1. On click: call `encodeShareURL()`, `navigator.clipboard.writeText(url)`
2. Set local `copied` state → renders "Copied!" for 1.5 s, then reverts to "Share"
3. `disabled` when `parquetURL` is empty

No store access. Placed inline next to the URL input's "Load" button.

### `src/ui/DriftBanner.tsx`

Props: `{ visible: boolean; onDismiss: () => void }`

Renders a dismissible yellow banner when `visible`:

```
⚠ Schema has changed since this link was created — some columns may differ.  [✕]
```

Returns `null` when `visible=false`. No store access.

### State additions

```ts
sharedFingerprint: string | null; // decoded from #sf= on load; NOT persisted
schemaDrift: boolean; // true when live fingerprint ≠ sharedFingerprint
```

New actions:

- `SET_SHARED_FINGERPRINT { fingerprint: string }` — dispatched on load before probe
- `SCHEMA_DRIFT_DETECTED` — dispatched after schema loads if fingerprints differ
- `DISMISS_DRIFT` — dispatched when user closes the banner

### `App.tsx` changes

**On mount** (existing `useEffect` extended):

```
if hash has url param:
  1. dispatch SET_URL
  2. if hash has q param: dispatch SET_QUERY
  3. if hash has sf param: dispatch SET_SHARED_FINGERPRINT
  4. auto-fire handleProbe()
```

**After schema loads** (in the `.then()` callback):

```
if sharedFingerprint is set and columns loaded:
  live = computeFingerprint(columns)
  if live !== sharedFingerprint: dispatch SCHEMA_DRIFT_DETECTED
```

---

## Fingerprint Design

```
Input:  [{ name: 'id', type: 'INTEGER' }, { name: 'label', type: 'VARCHAR' }]
String: "id:INTEGER,label:VARCHAR"
Hash:   FNV-1a 32-bit → e.g. "a3f8c21d"
```

Reuses the same `fnv1a32()` already in `src/cache/opfs.ts` — extract to `src/util/sharing.ts` and import from there in `opfs.ts`.

---

## Error Handling

- Clipboard API failure (denied permission): catch silently, show "Copy failed" in button for 1.5 s
- `decodeShareParams` returns nulls for malformed/missing params — callers treat null as absent
- Auto-probe on load re-uses the existing probe error path (shows `ErrorPanel`)
- Schema fetch failure during auto-probe: existing `SCHEMA_ERROR` path, no drift check runs

---

## Testing Strategy

### Unit tests (`sharing.test.ts`)

- `computeFingerprint` is stable across identical inputs
- `computeFingerprint` differs for reordered columns
- `encodeShareURL` produces a URL with correct hash params
- `decodeShareParams` round-trips encode/decode
- `decodeShareParams` rejects `javascript:` scheme URLs
- `decodeShareParams` handles missing `q` and `sf` gracefully

### Component tests (`ShareButton.test.tsx`, `DriftBanner.test.tsx`)

- ShareButton: disabled when no URL; shows "Copied!" after click; reverts after timeout
- DriftBanner: renders nothing when `visible=false`; renders warning when `visible=true`; calls `onDismiss` on ✕ click

### State tests (`queryState.test.ts` additions)

- `SET_SHARED_FINGERPRINT` stores fingerprint
- `SCHEMA_DRIFT_DETECTED` sets `schemaDrift=true`
- `DISMISS_DRIFT` sets `schemaDrift=false`
- `SET_URL` resets `sharedFingerprint` and `schemaDrift`

### E2E (`tests/e2e/phase4.spec.ts`)

- Share button visible after probe
- Copy + navigate to generated URL → URL input populated, SQL restored, probe fires automatically
- Drift banner visible when `sf` param doesn't match live schema

---

## Spec Self-Review

**Placeholder scan**: No TBDs. `fnv1a32` extraction from `opfs.ts` to `sharing.ts` is a clear concrete step.

**Internal consistency**: `sharedFingerprint` flows `decodeShareParams` → `SET_SHARED_FINGERPRINT` → state → drift check after `SCHEMA_DONE`. Clean.

**Scope**: Fits in a single implementation plan. No decomposition needed.

**Ambiguity**: "auto-probe" only fires when the hash was present at page load (initial mount effect), not on every hash change — avoids infinite probe loops.
