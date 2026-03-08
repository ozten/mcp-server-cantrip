---
title: "fix: Dogfooding issues batch — rename billing, dismiss entities, description fixes, whoami status"
type: fix
status: completed
date: 2026-03-08
---

# Fix: Dogfooding Issues Batch

Six issues from dogfooding. Five touch `src/tools.ts` (MCP side), one is daemon-only. All MCP changes are description/handler updates — no new tools, no schema changes.

Reference: `PLAN.md` in repo root has full implementation details with ready-to-paste code.

## Acceptance Criteria

### Fix 1: Rename billing → meter
- [x] Rename `cantrip_billing_balance` → `cantrip_meter_balance` (`src/tools.ts`)
- [x] Rename `cantrip_billing_history` → `cantrip_meter_history` (`src/tools.ts`)
- [x] Rename `cantrip_billing_tiers` → `cantrip_meter_tiers` (`src/tools.ts`)
- [x] Handler commands changed from `"billing"` to `"meter"` (`src/tools.ts`)
- [x] Descriptions updated to use "credits" language (`src/tools.ts`)
- [ ] ⚠️ **Ship simultaneously with daemon `meter` dispatch expansion** — MCP rename without daemon support will break all three tools

### Fix 2: Dismiss on entities (not just escalations)
- [ ] **BLOCKED on daemon** — daemon only searches escalations table for dismiss. MCP description must stay as "escalations only" until daemon is updated.
- [ ] Update `cantrip_review_dismiss` description to cover entities + escalations (`src/tools.ts`)
- [ ] Update `id` field `.describe()` from `"Escalation ID"` to `"Entity or escalation ID to dismiss"` (`src/tools.ts`)
- [x] No handler change needed — already sends `review dismiss <id>`

### Fix 3: Snapshot description for discoverability
- [x] Rewrite `cantrip_snapshot` description with explicit list/show verbs and examples (`src/tools.ts`)
- [ ] ⚠️ **Clarify entity_type format**: description examples use plural/hyphenated (`icps`, `pain-points`) but `ENTITY_TYPES` const uses singular/underscore (`icp`, `pain_point`). Confirm which format the daemon's snapshot command expects and make description match.

### Fix 4: Stale field docs in cantrip_entity_add
- [x] Add missing fields per type in description (`src/tools.ts`):
  - icp: `current_alternatives`, `priority`, `is_beachhead`
  - channel: `description`, `estimated_reach`, `conversion_rate`
  - experiment: `status`, `success_metrics`, `outcome_notes`
  - competitor: `pricing_model`
  - contact: `phone`, `source`, `url`, `notes`
- [ ] Note in description that channel `description` maps to `notes` on daemon side
- [x] Verify `cantrip_entity_edit` cross-reference ("same as cantrip_entity_add") is still sufficient

### Fix 5: Integrate whoami into cantrip_status
- [x] Change handler from `postCantrip("snapshot", ...)` to `postCantrip("whoami", ...)` (`src/tools.ts`)
- [x] Return structured object: `{ status, daemon, api_key_configured, current_project, identity }` (`src/tools.ts`)
- [x] Add try/catch for unreachable daemon (`src/tools.ts`)
- [x] Update description to mention authentication and identity (`src/tools.ts`)
- [x] ⚠️ **Differentiate error types**: `postCantrip` throws for both network failures (`client.ts:71-77`) and application errors (`client.ts:80-82`). Check error message for `"Cannot reach cantrip daemon"` prefix to distinguish `daemon: "unreachable"` from `daemon: "reachable", auth: "error"`.
- [ ] ⚠️ **Verify `whoami` works without API key**: current `snapshot` call may work unauthenticated for local dev. If `whoami` requires auth, this breaks status checks for local-only users. Test or add fallback.

### Fix 6: Credits remaining in responses (daemon-only)
- [ ] Daemon injects `_meta` with `credits_used` and `credits_remaining` after settlement
- [ ] No MCP changes — JSON passes through transparently via `postCantrip()`
- [ ] ⚠️ Confirm all cost-incurring operations return JSON objects (not arrays), since `_meta` injection uses `as_object_mut()`
- [ ] ⚠️ Audit existing daemon responses for `_meta` key collisions

## Context

**Key files:**
- `src/tools.ts` — all 17 tool definitions, primary file for fixes 1-5
- `src/client.ts` — HTTP client with `postCantrip()`, relevant to fix 5 error handling
- `src/index.ts` — registration loop, no changes needed
- `src/types.ts` — types, no changes needed

**Execution order:**
1. MCP-only changes (fixes 3, 4, 5) — ship immediately, no daemon dependency
2. Meter rename (fix 1 MCP side) — ship simultaneously with daemon `meter` dispatch
3. Entity dismiss (fix 2) — ship after daemon adds `dismissed` review state
4. Credits in _meta (fix 6) — daemon-only, ship independently

## MVP

All changes are in `src/tools.ts` except fix 6 (daemon-only).

### src/tools.ts

Fixes 3, 4, 5 are independent MCP-only changes — implement and ship first. Fix 1 (rename) and fix 2 (dismiss description) require coordinated daemon changes.

See `PLAN.md` for exact code snippets for each fix.

## Sources

- **Origin**: `PLAN.md` — full implementation plan with code examples
- **SpecFlow gaps identified**: error differentiation in fix 5, `id` field description in fix 2, entity_type format ambiguity in fix 3, `_meta` injection edge cases in fix 6
