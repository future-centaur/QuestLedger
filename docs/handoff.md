# QuestLedger — Handoff

**Read this first, then read [`APPDEPLOY_DECOUPLING_BRIEF.md`](./APPDEPLOY_DECOUPLING_BRIEF.md) and [`DECOUPLING_AUDIT.md`](./DECOUPLING_AUDIT.md) in that order.** The brief says why the migration is happening. The audit says what the code actually is. This file says where things stand right now and what to do next.

- **Date:** 2026-10-05
- **Branch:** `docs/decoupling-audit`
- **Working tree:** clean
- **Unpushed:** `7e31c4a` (the audit)
- **`main` / `origin/main`:** `a5d48d4`

---

## 1. What this app is

QuestLedger is a personal-finance app framed as an RPG. Savings goals are "quests"; financial behaviour produces character stats (Integrity, Discipline, Consistency, Balance, Power, Adaptability) and XP.

The product stance that matters for any refactor, stated in the README: **completion is not spending.** Money stays in a quest's `saved` balance until you explicitly declare it `spent`. The app also deliberately tracks *assigned/expected* balances rather than verified external bank balances — there is no bank connection, and that is intentional, not a gap.

### The core invariant

Money exists in exactly three pools and is conserved across them:

```
totalMoney = profile.unallocated
           + Σ goals.saved      (standalone quests only)
           + Σ commitments.balance
```

No operation creates or destroys money. Every route moves it between pools or converts it to `spent`, and every movement appends an immutable row to `events`. **Any change that breaks this invariant is a bug, regardless of what the code appears to do.**

### The subtlety to understand first

`goals` is a **polymorphic table**. A row is either:

- a **standalone quest** — owns money in `saved`; or
- a **period instance** of a recurring commitment — carries `commitmentId` + `periodKey`, holds **no money**; the balance lives on the commitment and the row is history only.

This distinction is enforced by `if (g.commitmentId)` guards appearing **11 times** in `backend/index.ts`, each guarding a different rule (can't edit, can't contribute, can't complete, can't spend…). Anyone who misreads a period instance as a funded goal will corrupt balances. `ensureInstances()` (`backend/index.ts:92`) creates period rows lazily; the cron advances them.

---

## 2. Current state

### Architecture as deployed

```
React + Vite  →  @appdeploy/client (auth, api)  →  AppDeploy API  →  AppDeploy DB
                                                        ↓
                                              cron.json: processCommitments (*/5 min, Africa/Nairobi)
```

Three entry points, not one:

| Entry | File | Purpose |
| --- | --- | --- |
| Browser | `index.html` → `src/main.tsx` → `src/App.tsx` | All UI, single 131-line file |
| HTTP | `backend/index.ts` → `export handler` | 21 routes, all `requireAuth()` |
| Cron | `backend/index.ts` → `export processCommitments` | Commitment deduction |

### Repo shape

```
QuestLedger/
├── src/
│   ├── App.tsx          131 lines — every component in one file
│   ├── main.tsx         10 lines
│   └── index.css        32 lines — hand-written CSS, dense
├── backend/
│   ├── index.ts         441 lines — types + domain + all 21 routes
│   ├── realtime.ts        21 lines — DEAD CODE
│   └── realtime-subscribers.ts  117 lines — DEAD CODE
├── tests/tests.json     6 declarative E2E scenarios (not executable here)
├── docs/                brief + audit + this file
├── appdeploy.auth-login.json  platform config: OAuth methods + theme
└── cron.json            platform config: schedule
```

~740 lines of application code total.

### What works

All six test scenarios pass against the deployed build, covering: commitment creation, sign-in and the funded workspace, quest edit + target adjustment, quest archive with explicit reallocation, commitment edit/archive, and archive guardrails.

### Two bugs were fixed two commits ago

Worth knowing because the audit references them:

- **`bbf8c23`** added the missing `POST /api/commitments` route. Creating a recurring commitment — the app's headline feature — had **no server endpoint**. The frontend called it; nothing handled it.
- **Same commit** removed a frequency check from `POST /api/commitments/update`. The frontend's edit form doesn't send `frequency`, so `validFrequency(undefined)` was always false and **every commitment edit returned a 400**. Both the create and edit paths were dead; both are now covered.

### Conventions to preserve

These are deliberate. Match them when editing.

- **No SQL anywhere.** All persistence goes through `db.*` with plain `{ id, ...fields }` objects.
- **No layering.** No `services/`, `models/`, `controllers/`. `backend/index.ts` *is* the schema.
- **Guard-clause validation, never exceptions.** `if (!x || n <= 0) return error('...', 400)`. Message text encodes product rules and tests assert against it.
- **`const P = (fn) => [requireAuth(), fn)`** (`:212`) wraps every route. Ownership is re-checked per row (`g.ownerUserId !== u`) as defense in depth.
- **Refetch-after-write.** `mutate()` posts then calls `load()` for the full state. No cache, no optimistic updates. `GET /api/state` is the single read endpoint.
- **One endpoint, whole-world snapshot.** The client holds no local state beyond `{user, state, tab, modal, form}`.
- **Dense one-liners and inline ternaries** throughout. This is house style, not carelessness.
- **`ownerUserId` on every row**, stamped centrally by `event()` (`:176`) so callers can't forget it.

---

## 3. Blockers — resolve before designing the schema

Both need answers from outside the repository. Neither is a code-reading problem.

### B1. Is `db.update` with multiple records atomic?

`backend/index.ts:357` (`/api/commitments/rebalance`) passes two `{ id, record }` objects in a single call. If that isn't atomic, the route can **destroy money mid-transfer** — decrement one commitment, fail to increment the other.

The SDK contract isn't visible from this repo. Confirm against AppDeploy SDK documentation or by test. This is the highest-severity unknown in the codebase.

### B2. The list caps are truncating in production right now

`goals` reads at `limit: 100`, `events` at `limit: 200`, `profile` at `limit: 500` in the cron. `db.list` truncates **silently** — no error.

Consequences already live: a user with >100 goals loses goals from their dashboard; the cron stops processing users past the 500th profile. **This is a live bug independent of the migration.** Get real production row counts — this also determines whether the data export can use the API at all or needs direct database access (see §5).

---

## 4. Next steps

The full sequence is in [`DECOUPLING_AUDIT.md` §7.3](./DECOUPLING_AUDIT.md#73-sequenced-plan). **Steps 1–3 are ready to start now** and need no answers from B1 or B2.

### Step 1 — Delete `backend/realtime*.ts`

138 lines of dead code. `realtimeSubscriptionRoutes` is never imported by `backend/index.ts`; nothing in `src/` subscribes. The frontend refetches after every mutation instead.

Also removes the `entity_subscriptions` table from the migration scope.

### Step 2 — Extract shared types

`Goal`, `Commitment`, `Event`, `State` are declared structurally in **both** `src/App.tsx:5-10` and `backend/index.ts:3-19`. Create a shared `types/` package imported by both sides. Structural duplication across the trust boundary is exactly the drift risk the decoupling exists to remove.

### Step 3 — Introduce the provider interface

**No behaviour change.** Define `QuestLedgerClient` and implement it over the current SDK; `App.tsx` imports the interface rather than `@appdeploy/client`.

```ts
interface QuestLedgerClient {
  getUser(): Promise<User | null>;
  signIn(): Promise<{ user: User }>;
  signOut(): Promise<void>;
  get<T>(path: string): Promise<{ data: T }>;
  post<T>(path: string, body: unknown): Promise<{ data: T }>;
}
```

The coupling is **four call sites** (`App.tsx:22-27`), so this is small. Do it before the database work rather than swapping the import directly — a direct swap couples the domain to one backend's transport, so the next migration costs the same again.

Two contract details the interface must preserve: `mutate()` reads `e.response.data.message || e.response.data.error` (`App.tsx:27`), and `signIn` branches on the untyped codes `popup_blocked` / `popup_closed`.

### Steps 4+ — Blocked on B1, B2, and two decisions

See §6 for the decisions.

---

## 5. Before designing the export

`db.list` is the only read path — there's no admin route, script, or bulk endpoint. Migration needs a one-off script that authenticates as each user and pages through all six tables.

**But B2 gates this.** If live `goals` or `events` exceed the current read caps, they **cannot be read in full through the API** and direct platform database access becomes necessary. Get counts first; they decide the approach.

What must survive:

- **Event history.** Roughly 20 event types, and it is the *only* source for derived stats — `getState:151-156` re-counts the ledger on every read. Losing it silently resets three character stats.
- **Balances imported as-is, never re-derived.** Import `profile.unallocated`, `goals.saved`, `commitments.balance` verbatim, then reconcile: `unallocated + Σ saved + Σ balance == Σ events where type = 'money_added'`. Investigate any discrepancy *before* cutover.
- **`periodKey` verbatim.** It's the idempotency key — `reason === 'period:' + key` (`:185`) is the only thing preventing double deduction. Re-deriving it from a date can silently collide.
- **Identity.** `ownerUserId` holds AppDeploy ids that won't survive; map via email (`auth.getUser()` returns it).
- **Event ordering.** `createdAt` with a tiebreaker for equal timestamps.

**Cutover can be read-only.** The client holds no cache and refetches everything after every write, so a maintenance window is sufficient. Run all six `tests/tests.json` scenarios as a pre-migration baseline, then again after.

---

## 6. Open decisions

Four need a human answer before step 4.

**D1. Split `goals`, or keep it polymorphic?**
*Recommendation: split into `goals` + `commitment_periods`.* Kills the 11 `if (g.commitmentId)` guards, gives periods real columns, and makes `(commitment_id, period_key)` a database-enforced unique constraint — which is what makes cron deduction safe under concurrency rather than guarded in application code.

**D2. How is money stored?**
Currently JavaScript `number` (float64), formatted `KSh ${Math.round(n).toLocaleString()}`. **Money as float64 is not acceptable in a financial app.** Use `NUMERIC(14,2)` or integer minor units. This is a correctness change, not a port.

**D3. Where does balance arithmetic live?**
Route-level transactions alone are **not sufficient**. `xp()` (`:44`) is itself a read-modify-write on `profile`, and every Tier 1 route touches `profile` twice — `/api/contributions` decrements `unallocated` and separately increments `xp`. The arithmetic must move into SQL, with the sufficiency check in the `WHERE` clause:

```sql
UPDATE commitments SET balance = balance - $1
WHERE id = $2 AND owner_user_id = $3 AND balance >= $1
RETURNING balance;
```

Doing it in JavaScript reintroduces the lost-update race *inside* the transaction's own isolation level.

**D4. Currency and timezone — out of scope, but note the timing.**
`KSh` is hardcoded in `money()` (`App.tsx:12`); `Africa/Nairobi` is in `cron.json`. Not required for the decoupling, but the Postgres move is the natural moment to make them configuration — cheaper then than to retrofit.

---

## 7. Things that will trip you up

- **The repo is a mirror, not the source of truth.** Every commit is `Sync QuestLedger from AppDeploy`. **AppDeploy is authoritative; GitHub is downstream.** So there is no CI, no lockfile, no `.env.example`, and no reviewable change history — only snapshots. If you change code here, it does not affect production until it syncs back from the platform.
- **`npm run dev` fails.** `@appdeploy/client` and `@appdeploy/sdk` are **not in `package.json`** — the platform supplies them. README acknowledges this. There's no lockfile either.
- **`tsconfig.json` has `"include": ["src"]`.** `tsc --noEmit` **never checks `backend/`** — all 441 lines, including the domain type definitions, are unverified by the type system.
- **No lint, no unit tests, no CI, no Dockerfile.** `tests/tests.json` is declarative JSON read by a platform-run agent — **not executable locally.**
- **`GET /api/state` performs writes on every call.** `getState()` → `defaults()` + `migrateCommitments()` + `ensureInstances()`, up to 6 writes. Because the client refetches after every mutation, every write is followed by a read that writes. Make GET read-only before trusting anything else.
- **`claim()` (`:22`) must not be ported.** It lists all six tables **unfiltered** and assigns every row lacking `ownerUserId` to the calling user. In a multi-user world that's a cross-user data-assignment primitive. Currently benign only because the app predates auth — and it runs on every state read.
- **`migrateCommitments()` (`:106`) and `defaults()` (`:29`) are pre-auth migrations.** Postgres gets schema migrations instead.

---

## 8. Reference documents

| Document | Read it for |
| --- | --- |
| [`APPDEPLOY_DECOUPLING_BRIEF.md`](./APPDEPLOY_DECOUPLING_BRIEF.md) | Why the migration. Target architecture, the `Validate → BEGIN → Lock → Update → Event → COMMIT` pattern, and the "decoupling not a rewrite" constraint. |
| [`DECOUPLING_AUDIT.md`](./DECOUPLING_AUDIT.md) | The code as it actually is. All 21 API contracts, the six audit categories, the full 8-step sequence, and both blockers in detail. |
| [`README.md`](../README.md) | Product model and the integrity stance. Note: its project tree is slightly stale (lists `tests/tests.txt`, actual file is `tests.json`; doesn't mention `docs/`). |
