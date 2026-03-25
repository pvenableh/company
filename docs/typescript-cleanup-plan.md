# TypeScript Cleanup Plan

## Current State
522 errors across 146 files. All are pre-existing — none block the build or runtime.

## Top Error Categories (by frequency)

| Error | Count | Fix Strategy |
|-------|-------|-------------|
| TS2558 (extra type args) | 94 | Nuxt auto-import generics — update `useDirectusItems<T>()` calls |
| TS18048 (possibly undefined) | 90 | Add optional chaining `?.` or non-null `!` where safe |
| TS2339 (property not on type) | 73 | Type Directus responses properly or use `as any` |
| TS2532 (possibly undefined) | 66 | Same as TS18048 but in templates |
| TS2345 (arg not assignable) | 58 | Fix function signatures or add type assertions |
| TS2322 (type not assignable) | 55 | null vs undefined mismatches — standardize |

## Recommended Approach

### Phase 1 — Bulk fixes (eliminates ~250 errors)
1. Fix all `useDirectusItems<T>()` generic calls (TS2558 — 94 errors)
2. Add `?.` to all Directus response property accesses (TS18048 + TS2532 — 156 errors)

### Phase 2 — Type safety (eliminates ~130 errors)
3. Type composable return values explicitly (TS2339 — 73 errors)
4. Fix null/undefined standardization (TS2322 — 55 errors)

### Phase 3 — Strict mode (eliminates ~140 errors)
5. Add explicit types to function params (TS7006 — 12 errors)
6. Fix remaining argument type mismatches (TS2345 — 58 errors)
7. Fix overload resolution (TS2769 — 7 errors)
