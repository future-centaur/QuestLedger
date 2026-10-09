# QuestLedger Decoupling Audit

Companion to [`APPDEPLOY_DECOUPLING_BRIEF.md`](./APPDEPLOY_DECOUPLING_BRIEF.md), which defines the objective, target architecture, and migration principle. This document answers the brief's six-point audit request and proposes a sequence for execution.

- **Baseline commit:** `a5d48d4`
- **Scope:** 441 lines `backend/index.ts`, 138 lines `backend/realtime*.ts`, 131 lines `src/App.tsx`, 32 lines `src/index.css`
- **Conclusion:** the domain model is portable and worth roughly 90% of the backend file. Extraction is mostly mechanical. Two findings are blockers rather than backlog items; see [§8](#8-blockers).

---

## 1. AppDeploy-specific code

All coupling is carried by **three import lines**.

| Location | Import | Surface area |
| --- | --- | --- |
| `src/App.tsx:2` | `{ api, auth } from '@appdeploy/client'` | 4 call sites — **now `src/client.platform.ts`, 1 import** (`aa292fb`) |
| `backend/index.ts:1` | `{ router, json, error, db, requireAuth } from '@appdeploy/sdk'` | 70 call sites |
| `backend/realtime-subscribers.ts:1` | `{ db, ws, json, error } from '@appdeploy/sdk'` | dead code |

### Frontend

Exactly four usages, all in `src/App.tsx:22-27`:

```tsx
auth.getUser()                                  // :22
auth.signIn({ scope: 'openid email profile offline_access' })  // :23
auth.signOut()                                  // :24
api.get('/api/state')                           // :25
api.post(path, body)                            // :27
```

`signIn` uses OAuth scopes and a popup flow, and branches on untyped error codes:

```tsx
e?.code === 'popup_blocked'   → 'Please allow popups to sign in.'
e?.code === 'popup_closed'    → 'Sign-in was cancelled.'
```

These codes are part of the implicit contract. A replacement auth layer must reproduce them or the frontend's error copy becomes unreachable.

### Backend

Coupling is concentrated in `db`, but the SDK shape is closer to portable than it looks:

| Call | Signature | Count |
| --- | --- | --- |
| `db.list` | `(table, { limit, filter }) → { items }` | 18 |
| `db.update` | `(table, [{ id, record }])` | 26 |
| `db.add` | `(table, [record]) → [id]` | 10 |
| `db.get` | `(table, [id]) → [row]` | 10 |
| `db.delete` | `(table, [ids])` | 0 |

Six tables: `goals`, `accounts`, `buckets`, `events`, `profile`, `commitments`.

Every call is a table name plus a plain object of shape `{ id, ...fields }`. **There is no SQL anywhere in the repository.** Portability is therefore high. The genuinely awkward parts are narrower:

- `limit`-capped lists with no pagination
- no transactions
- `requireAuth()` injecting `c.user.userId` into the handler context
- `filter` semantics limited to equality on top-level fields

### Dead code — do not port

`backend/realtime.ts` and `backend/realtime-subscribers.ts` (138 lines) implement websocket pub-sub over an `entity_subscriptions` table using `ws.send`. Confirmed unreferenced: `realtimeSubscriptionRoutes` is never imported by `backend/index.ts`, and nothing under `src/` subscribes to realtime. The frontend instead refetches full state after every mutation.

**Delete both files during decoupling.** They also represent a table that would otherwise need creating and migrating.

### Platform-owned configuration

Neither file is read by application code; the platform interprets both.

- `appdeploy.auth-login.json` — OAuth methods (`google`, `apple`, `x`), copy, theme (`#d7f36a` on `#0b0f14`, Inter, 14px radius). Note the theme hex values are **duplicated** in `src/index.css:11` with no shared source of truth.
- `cron.json` — `processCommitments`, `*/5 * * * *`, `Africa/Nairobi`.

Each needs an equivalent: environment variables plus a config module.

---

## 2. Reusable domain logic

The domain is portable and constitutes the majority of the backend file.

### Reusable — port as-is

**Type definitions** (`backend/index.ts:3-19`). `Goal`, `Commitment`, `Event`, `Owned`. These are the schema.

**Schedule math** (`:53-91`). `validFrequency()`, `daysInMonth()`, `nextDueAt()`, `duePeriodKey()`. Careful, correct, and UTC throughout with a 00:05 due time. Port verbatim.

**`changeGoal()`** (`:167`). The single guarded balance mutator. Enforces `ownerUserId` ownership and `saved + delta >= 0`. The correct place for row locking in the new backend.

**`deductCommitment()`** (`:180`). Contains the idempotency pattern discussed in [§6](#6-migration-requirements-and-data-integrity).

**`event()`** (`:176`). Stamps `ownerUserId` centrally so callers cannot forget ownership.

**`xp()`** (`:44`). A bare increment of `profile.xp` — nothing more. It contains **no
level logic**; the level derivation `Math.max(1, Math.floor(xp / 500) + 1)` lives in
the frontend at `App.tsx:28`. Port `xp()` as a single function and levels still work,
because levels were never its job.

**Validation guard-clauses.** The `if (!x || n <= 0) return error('...', 400)` idiom, message text included. These encode product rules and are what the tests assert against.

**Read model.** `getState()` (`:126`), the `State` shape, stat derivation (`:151-156`), `recurringHealth.monthlyOutflow` normalisation (30.4375 / 4.345 / 12), and frontend helpers `statusFor`, `cyclesText`, `exhaustionText`.

**Frontend, in full.** All components and all of `src/index.css`. No platform coupling in either.

### Discard

| Function | Reason |
| --- | --- |
| `claim()` (`:22`) | pre-auth legacy-ownership migration; unsafe to port ([§5](#5-operations-requiring-transactional-treatment)) |
| `migrateCommitments()` (`:106`) | pre-auth balance migration; superseded by a Postgres schema migration |
| `defaults()` (`:29`) | seeding becomes seed SQL or a migration |

### The observation that shapes the migration

Domain logic is *interleaved with* persistence but never entangled with it. Every business rule already lives in small functions sitting above the `db.` calls. Extraction is mechanical — this is what makes the brief's "decoupling, not a rewrite" framing achievable without redesign.

---

## 3. Current schema and data

There are no migrations, no schema files, and no SQL. The schema exists only as TypeScript interfaces plus implicit defaults at write sites. Inferred shape:

**`profile`** — 1:1 with user. `{ id, xp = 0, unallocated = 0, ownerUserId }`

**`goals`** — `{ id, name, target, saved, spent, bucket, account?, deadline?, status, kind, ownerUserId, commitmentId?, periodKey?, periodStatus?, archived? }`

Dual-purpose. Either a standalone quest, or a **period instance** of a recurring commitment in which case it carries `commitmentId` + `periodKey` and holds no money — the balance lives on the commitment. This polymorphism is the subtlest part of the model and the one genuine schema problem; see below.

**`commitments`** — `{ id, name, amount, frequency, dueDay?, kind, bucket, account?, active, balance?, nextDueAt?, pendingAmount?, pendingFrequency?, fundingMigrated, archived?, ownerUserId }`

> `archived` is written by `POST /api/commitments/archive` (`:404`) and read back at
> `:393` to block edits, and the frontend filters on it. It is listed here because
> omitting it from a schema built off this section makes archived commitments
> **editable again** — a silent behaviour change.

**`events`** — `{ id, type, amount, from?, to?, goalId?, commitmentId?, createdAt, reason?, location?, ownerUserId }` across roughly 20 event types. `reason` is overloaded: free text for humans, and idempotency key `'period:<key>'` for the cron.

**`accounts`** / **`buckets`** — `{ id, name, ownerUserId }`

### Five schema problems to resolve before writing DDL

**3.1 `goals.commitmentId` is a polymorphic union.** Standalone goals have it `null`; period instances carry `commitmentId` + `periodKey`. The guard `if (g.commitmentId)` appears 11 times across the backend, each guarding a different rule. *Recommendation: split into `goals` and `commitment_periods`.* This eliminates the guard class, gives periods real columns, and makes `periodKey` enforceable as a composite unique constraint — which is what makes cron deduction safe under concurrency.

**3.2 No numeric type discipline.** Amounts are JavaScript `number`, formatted as `KSh ${Math.round(n).toLocaleString()}`. Money as float64 is not acceptable in a financial application. Use `NUMERIC(14,2)` or integer minor units. This is a correctness change, not a port.

**3.3 No referential integrity.** `ownerUserId` is a bare string with no foreign key anywhere in the schema. `events.goalId` can dangle. Introduce real FKs with `ON DELETE RESTRICT` on financial history.

**3.4 No constraints at all.** `status`, `kind`, `frequency`, and event `type` are free-form strings enforced only in application code. Add `CHECK (saved >= 0)`, `CHECK (balance >= 0)`, and enum types.

**3.5 Unbounded list caps acting as implicit pagination.** `goals limit 100`, `events limit 200`, `commitments limit 100`, `profile limit 500` in the cron. `db.list` truncates silently — no error is raised. **A user with more than 100 goals loses goals from their dashboard**, and the cron stops processing users past the 500th profile. This is a live bug, not a migration concern, and Postgres resolves it outright.

---

## 4. API contracts used by the frontend

21 routes, all wrapped in `requireAuth()` via `const P = (fn) => [requireAuth(), fn]` (`:212`). All responses are `{ ok: true }`, `{ id }`, or an `error(message, status)`.

The frontend is the only consumer and depends on exactly this surface:

| Method | Path | Request body | Response |
| --- | --- | --- | --- |
| GET | `/api/state` | — | full `State` snapshot |
| POST | `/api/money` | `{ amount, location }` | `{ ok }` |
| POST | `/api/goals` | `{ name, target, bucket, account?, deadline?, kind }` | `{ id }` |
| POST | `/api/goals/update` | `{ id, name, bucket, account, deadline?, kind }` | `{ ok }` |
| POST | `/api/goals/adjust-target` | `{ id, target, releaseTo? }` | `{ ok }` |
| POST | `/api/goals/archive` | `{ id, releaseTo? }` | `{ ok }` |
| POST | `/api/contributions` | `{ goalId, amount }` | `{ ok }` |
| POST | `/api/commitments` | `{ name, amount, frequency, dueDay, kind, bucket, account }` | `{ id }` |
| POST | `/api/commitments/topup` | `{ id, amount }` | `{ ok }` |
| POST | `/api/commitments/spend` | `{ id, amount, reason? }` | `{ ok }` |
| POST | `/api/commitments/rebalance` | `{ id, amount, to, reason? }` | `{ ok }` |
| POST | `/api/commitments/toggle` | `{ id, active }` | `{ ok }` |
| POST | `/api/commitments/adjust` | `{ id, amount?, frequency? }` | `{ ok }` |
| POST | `/api/commitments/update` | `{ id, name, bucket, account, kind }` | `{ ok }` |
| POST | `/api/commitments/archive` | `{ id }` | `{ ok }` |
| POST | `/api/complete` | `{ goalId }` | `{ ok }` |
| POST | `/api/spend` | `{ goalId, amount, reason? }` | `{ ok }` |
| POST | `/api/rebalance` | `{ kind, from, to?, amount, reason? }` | `{ ok }` |
| POST | `/api/accounts` | `{ name }` | `{ id }` |
| POST | `/api/buckets` | `{ name }` | `{ id }` |

### Load-bearing contract details to preserve

- **`releaseTo: 'unallocated' | <goalId>`** — a string-tagged union, used by both `adjust-target` and `archive`.
- **`rebalance.kind`** — `'transfer' | 'expense' | 'withdrawal'`.
- **Error shape.** The frontend reads `e.response.data.message || e.response.data.error` (`App.tsx:27`). Copy this.
- **Auth error codes.** `popup_blocked`, `popup_closed`.
- **`GET /api/state` is the centre of gravity.** The client holds no local state, no cache, and refetches after every mutation. Its shape is defined at `src/App.tsx:10` and must match field-for-field or the application breaks.

### Frontend change footprint

Four call sites, roughly 15 lines. That is the entire coupling — and also the reason to introduce a seam rather than swap the import directly; see [§7](#7-recommendations).

---

## 5. Operations requiring transactional treatment

21 routes, 18 write operations, 36 write calls total (26 `db.update` + 10 `db.add`).

### Tier 1 — money movement, must be atomic (10 operations)

| Route | Writes | Failure mode today |
| --- | --- | --- |
| `/api/money` | profile, event | Money created, event lost — acknowledged at `:223` |
| `/api/contributions` | profile−, goal+, event | Unallocated decremented, goal not incremented → **money vanishes** |
| `/api/goals/adjust-target` | profile+ or goal+, goal, event | Released excess unaccounted |
| `/api/goals/archive` | profile+ or goal+, goal, event | Allocation orphaned |
| `/api/commitments/topup` | profile−, commitment+, event | Reserve created from nothing |
| `/api/commitments/spend` | commitment−, event | Balance decremented, no history |
| `/api/commitments/rebalance` | **two commitments in one call** (`:357`), event | **Partial transfer destroys money** |
| `/api/spend` | goal, event, xp | Spent recorded, saved not reduced |
| `/api/rebalance` | goal−, goal+, event | Manual compensation at `:430` |
| `deductCommitment` (cron) | commitment, goal, event, xp | Four writes, cross-request idempotency |

`/api/commitments/rebalance:357` is the worst case. It passes two `{ id, record }` objects to a single `db.update` call. Whether that is atomic is **not determinable from this repository** — the SDK contract is not visible. This is the single most important question to answer; see [§8](#8-blockers).

### Tier 2 — reads that mutate state (3 functions)

**`GET /api/state` performs writes on every call.** `getState()` invokes `defaults()`, `migrateCommitments()`, and `ensureInstances()`, which together perform up to six writes. Because the frontend refetches after every mutation, **every write is followed by a read that performs up to six more writes.**

Consequences:

- GET is neither idempotent nor read-only, which breaks HTTP caching, safe retries, and any future read replica.
- `ensureInstances()` (`:92`) is check-then-act against `goals` — a genuine race.
- `claim()` (`:22`) lists **all six tables unfiltered** and assigns every row lacking `ownerUserId` to the calling user. In a multi-user deployment this is a cross-user data-assignment primitive. It is currently benign only because the application predates authentication, and it runs on every state read. **It must not be ported.**

*Recommendation:* move period-instance materialisation into the cron, or express it as `INSERT … ON CONFLICT DO NOTHING` against a `(commitment_id, period_key)` unique index. Making GET read-only is a prerequisite for trusting the rest of the design.

### Tier 3 — metadata and XP

`/api/goals`, `/api/goals/update`, `/api/commitments`, `/api/commitments/toggle`, `/api/commitments/adjust`, `/api/commitments/update`, `/api/commitments/archive`, `/api/accounts`, `/api/buckets`. Single-row writes with no balance change.

They still require transactions, because **`xp()` (`:44`) is itself a read-modify-write on `profile`.** In every Tier 1 route that also touches `profile.unallocated`, the same row is read and written twice — `/api/contributions` decrements `unallocated` and then separately increments `xp`, as two independent read-modify-write cycles.

**Every Tier 1 route touches `profile` twice.** Wrapping each route in a transaction is therefore necessary but not sufficient. The arithmetic must move into SQL:

```sql
UPDATE profile SET unallocated = unallocated - $1 WHERE owner_user_id = $2 RETURNING unallocated;
```

Doing it in JavaScript reintroduces the lost-update race inside the transaction's own isolation level.

---

## 6. Migration requirements and data integrity

### No export tooling exists

`db.list` is the only read path. There is no admin route, no script, and no bulk endpoint. Migration requires a one-off script that authenticates as each user and reads all six tables.

**Paging is not available on this SDK.** `db.list` is `(table, { limit, filter })`
with equality filters on top-level fields only — there is no cursor, offset, or
sort parameter. So "pages through all six tables" is not achievable as written. The
only workable API export is `filter: { ownerUserId }` with a raised per-user limit,
which is precisely what the caps constrain. **This makes the row counts below a
hard gate, not a formality:** if any per-user table exceeds its cap, the data is
not reachable through the API at all and direct database access is the only route.

See [`PROBE_B2_COUNTS.md`](./PROBE_B2_COUNTS.md) for a deployable probe that
establishes real counts by escalating `limit` until a call returns fewer rows than
requested — truncation is detectable even without a count API.

### Establish row counts before designing the export

`goals` is read at `limit: 100` and `events` at `limit: 200`. **If live data exceeds those caps, it cannot be read in full through the current API**, and direct platform database access becomes necessary. Get real counts first — this determines whether the migration is an API scrape or a database export.

**This is a live correctness problem, not only a display one.** The caps bound
guards, not just reads:

- `ensureInstances` (`:93`, goals cap 100) checks for an existing period row before
  inserting. Past 100 rows it cannot see the row, so it inserts a **duplicate**
  period for the same `(commitmentId, periodKey)`.
- `deductCommitment` (`:184`, events cap 200) dedupes deductions the same way, so
  **the idempotency guard against double deduction silently degrades** past 200.
- `:201` (profiles cap 500) stops the cron outright past the 500th user — those
  users' commitments are never deducted.

Totals can look healthy while individual users are over cap, because the caps apply
per user. The probe therefore reports per-user maxima, not just table totals.

### What must survive

**Event history is sacred.** The brief commits to preserving it, and it is also the *only* source for derived stats: `getState:151-156` re-counts the ledger on every read. Losing it silently resets Discipline, Consistency, and Adaptability.

**Balances must be imported as-is, not re-derived.** Import `profile.unallocated`, `goals.saved`, and `commitments.balance` verbatim, then reconcile against the ledger:

```
unallocated + Σ goals.saved (standalone quests only) + Σ commitments.balance
  ==  Σ events where type = 'money_added'
```

The `standalone quests only` filter is load-bearing and must match `getState:145`,
which sums `saved` over `!x.commitmentId`. Period instances hold no money — the
balance lives on the commitment — so including them double-counts any instance
with a non-zero `saved`. Summing `goals.saved` unfiltered produces a **false
discrepancy** whenever commitment history exists.

Any discrepancy is the interesting part and should be investigated before cutover, not after.

**Identity.** `ownerUserId` holds AppDeploy user ids, which will not survive the move. Map to new auth subject IDs via email — `auth.getUser()` already returns `{ name, email }`.

**`periodKey` must be preserved verbatim.** It is the idempotency key: `reason === 'period:' + key` (`:185`) is what prevents double deduction. Re-deriving it from a date can silently collide.

**Event ordering.** `createdAt` ordering must be stable, with a tiebreaker for equal timestamps.

### Cutover can be read-only

The frontend holds no cache and refetches everything after every write, so **a read-only maintenance window is sufficient.** No client migration is needed. The existing `tests/tests.json` scenarios can verify the result.

Run all six scenarios as a pre-migration baseline, then again post-migration. Given that two of the six were added or fixed in the last two commits, capture the baseline from the current build.

### Note on the recent fix

`POST /api/commitments` was added in `bbf8c23`, and `POST /api/commitments/update` had its frequency check removed in the same commit — both fixing live bugs. If any live commitment rows predate that fix, confirm none were created through a path that skipped `fundingMigrated: true`. That flag is what stops `migrateCommitments()` re-sweeping them after import.

---

## 7. Recommendations

### 7.1 Introduce a provider interface rather than swapping the import

> **Status: done in `82a7c0a`.** Landed as `src/client.ts` (interface), `src/client.platform.ts` (implementation), with `shared/types.ts` covering the second paragraph below. The `getUser()` signature gained a non-null `User` — the app treats a signed-out user as `null` at the call site, so the type is about the resolved case. See `handoff.md` §10.

**Recommendation: define a thin `QuestLedgerClient` interface, implement it with the current AppDeploy SDK today, and swap the implementation for HTTP later.**

The frontend touches the SDK in exactly four places, so a direct swap is about fifteen lines and looks like the simpler option. It is not simpler in the way that matters: it couples the domain to one backend's auth and transport, so the next migration costs the same again. The brief's stated goal — "deployable on multiple hosting platforms" — requires the seam.

The interface surface is small:

```ts
interface QuestLedgerClient {
  getUser(): Promise<User | null>;
  signIn(): Promise<{ user: User }>;
  signOut(): Promise<void>;
  get<T>(path: string): Promise<{ data: T }>;
  post<T>(path: string, body: unknown): Promise<{ data: T }>;
}
```

`App.tsx` imports the interface. The AppDeploy implementation lives behind it — in `src/client.platform.ts`, which is named for the shape of the implementation rather than the vendor, so the product surface carries no platform name and step 7 needs no further rename.

**Related: consolidate the duplicated types.** `Goal`, `Commitment`, `Event`, and `State` are declared structurally in both `src/App.tsx:5-10` and `backend/index.ts:3-19`. Structural duplication across a trust boundary is precisely the drift risk a decoupling should remove. Move them to a shared `types/` package imported by both sides.

### 7.2 Split `goals` into `goals` and `commitment_periods`

> **Status: deferred by decision, not rejected.** `Goal` is now a discriminated union (`StandaloneQuest | CommitmentPeriod`) in `shared/types.ts`, so the split is a schema migration rather than a refactor across ~20 guard sites. See `handoff.md` §6, D1.

**Recommendation: split.** Polymorphic tables force the `if (g.commitmentId)` guard to appear 11 times and make `periodKey` unenforceable by the database. Splitting gives:

- standalone quests with no nullable commitment column
- period rows with a real `(commitment_id, period_key)` unique constraint
- an `INSERT … ON CONFLICT DO NOTHING` path for `ensureInstances()`, which removes the check-then-act race
- database-level protection against the double-deduction the cron idempotency check currently guards in application code

The alternative — keeping polymorphism with a partial unique index — preserves a guard class that exists only because of the storage choice.

### 7.3 Sequenced plan

Each step is independently shippable. The interface lands before the database, so the frontend is never in a half-migrated state.

| # | Step | Outcome |
| --- | --- | --- |
| 1 | Delete `backend/realtime*.ts` | Removes 138 lines of dead code and an unwanted table — **pending confirmation** |
| 2 | Extract shared `types/` package | Eliminates cross-boundary type duplication — **done** (`82a7c0a`) |
| 3 | Define `QuestLedgerClient`; wrap current SDK | **No behaviour change** — seam established — **done** (`82a7c0a`) |
| 4 | Postgres schema: constraints, FKs, `NUMERIC` money, split period table | Fixes §3.1–3.5 |
| 5 | Transactional backend behind the same interface | Fixes §5 Tier 1 and Tier 3 |
| 6 | Reconciliation migration for data and event history | Preserves history per §6 |
| 7 | Flip client to the HTTP implementation | |
| 8 | Delete the AppDeploy backend | Decoupling complete |

Steps 1–3 are low-risk and independently valuable. They can proceed while the migration design is still open.

**Correction to that advice.** It said steps 1–3 could proceed *while the design is open*. Steps 2 and 3 were done, but step 1 was not: deleting `backend/realtime*.ts` requires knowing whether the platform auto-discovers named exports the way `cron.json` resolves `processCommitments` by name string. See `handoff.md` §3 and §4.

### 7.4 Move money arithmetic into SQL

Covered in [§5](#5-operations-requiring-transactional-treatment), but it is a design decision rather than a mechanical port, so it is called out here. Every balance mutation should be a single statement of the form:

```sql
UPDATE commitments SET balance = balance - $1
WHERE id = $2 AND owner_user_id = $3 AND balance >= $1
RETURNING balance;
```

The `balance >= $1` predicate moves the sufficiency check into the database, where it can be evaluated without a race. Route-level transactions alone do not achieve this.

### 7.5 Out of scope, but worth noting

Currency and timezone are hardcoded — `KSh` in `money()` (`App.tsx:12`) and `Africa/Nairobi` in `cron.json`. Neither is required for the decoupling. The Postgres move is the natural moment to make them configuration, and it is cheaper to do then than to retrofit afterwards.

---

## 8. Blockers

Two findings should be answered before the schema is designed. Both are questions about the current platform rather than about the target architecture.

**8.1 Is `db.update` with multiple records atomic?** `backend/index.ts:357` passes two `{ id, record }` objects in a single call during commitment rebalancing. The SDK contract is not visible from this repository, so multi-record atomicity cannot be confirmed from the source. If it is not atomic, `/api/commitments/rebalance` can currently destroy money mid-transfer. Confirm against the AppDeploy SDK documentation or by test.

**8.2 The list caps are already truncating in production.** `goals` at `limit: 100` and `events` at `limit: 200` mean any user above those thresholds silently loses data from their view, with no error surfaced. The cron at `limit: 500` profiles likewise stops processing users past the 500th. This is a live correctness bug in the current application, independent of the migration, and Postgres resolves it outright.

Both are worth confirming with real production data before the target schema is finalised.
