# QuestLedger — Handoff

**Read this first, then read [`APPDEPLOY_DECOUPLING_BRIEF.md`](./APPDEPLOY_DECOUPLING_BRIEF.md) and [`DECOUPLING_AUDIT.md`](./DECOUPLING_AUDIT.md) in that order.** The brief says why the migration is happening. The audit says what the code actually is. This file says where things stand right now and what to do next.

- **Date:** 2026-10-05
- **Branch:** `appdeploy-decoupling`
- **Working tree:** clean
- **Unpushed:** none — `origin/appdeploy-decoupling` is at `9edacc6`
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

### B1. Does the SDK expose a transaction primitive?

**Reframed from the original question.** The handoff previously asked whether `db.update` with multiple records (`backend/index.ts:357`, `/api/commitments/rebalance`) is atomic. That is the wrong question: `/api/contributions` writes `profile` at `:290` and the goal at `:291` in **two separate calls**, so per-call atomicity would not save it regardless. Most Tier 1 routes span two rows across two calls.

The decisive question is whether `@appdeploy/sdk` exposes any transaction primitive at all (`transaction` / `begin` / `sql` / a raw-query export).

- **No** → B1 is moot. No route can be made atomic on this platform, and the migration is forced regardless of the `:357` answer. Record it and stop.
- **Yes** → the atomicity question becomes cheap, and the correct near-term fix is available *before* Postgres.

The SDK contract isn't visible from this repo — it is unvendored and absent from `package.json`. Confirm against AppDeploy SDK documentation.

### B2. The list caps bound correctness guards, not just reads

`goals` reads at `limit: 100`, `events` at `limit: 200`, `profile` at `limit: 500` in the cron. `db.list` truncates **silently** — no error.

**This is more severe than "the dashboard loses goals."** The caps bound guards that protect money:

- `ensureInstances` (`:93`, goals cap 100) checks for an existing period row before inserting. Past 100 rows it cannot see the row, so it inserts a **duplicate** period for the same `(commitmentId, periodKey)`.
- `deductCommitment` (`:184`, events cap 200) dedupes deductions the same way — **the idempotency guard against double deduction silently degrades**.
- `:201` (profiles cap 500) stops the cron entirely past the 500th user; those commitments are never deducted.
- `claim` (`:24`) also caps at 100, unfiltered, so it silently no-ops past 100 legacy rows.

Whether this is *actively* losing data or merely latent is unknown and needs real counts. **Get them** — this also decides whether the export can use the API at all (see §5), because the SDK has no cursor or offset: `db.list` is `(table, { limit, filter })` with equality filters only, so "paging through" the tables is not possible as previously assumed.

A deployable probe is in [`PROBE_B2_COUNTS.md`](./PROBE_B2_COUNTS.md). It reports per-user maxima, not just totals — totals can look healthy while individual users are over cap, because the caps apply per user.

---

## 4. Next steps

The full sequence is in [`DECOUPLING_AUDIT.md` §7.3](./DECOUPLING_AUDIT.md#73-sequenced-plan).

> **Status note (2026-10-05).** This section previously said steps 1–3 were "ready to start now." They are still low-risk and independently valuable, but **B2 is now understood to bound money-correctness guards**, not just dashboard reads. Refactoring on an unverified foundation risks encoding the current assumptions. The agreed order is: **establish B1/B2 first** (probe in [`PROBE_B2_COUNTS.md`](./PROBE_B2_COUNTS.md)), then land steps 1–3, which do not depend on either answer.

### Step 1 — Delete `backend/realtime*.ts`

138 lines of dead code. `realtimeSubscriptionRoutes` is never imported by `backend/index.ts`; nothing in `src/` subscribes. The frontend refetches after every mutation instead. The two routes it defines are not even registered in the `router({...})` block.

One check before deleting: `cron.json` resolves `processCommitments` by **name string**, so confirm the platform does not auto-discover named exports in the same way — otherwise a deleted file could be silently load-bearing.

### Step 2 — Extract shared types

`Goal`, `Commitment`, `Event`, `State` are declared structurally in **both** `src/App.tsx:5-10` and `backend/index.ts:3-19`. Create a shared `types/` package imported by both sides. Structural duplication across the trust boundary is exactly the drift risk the decoupling exists to remove.

**The drift has already happened.** `Account`, `Bucket`, `State` and the `recurringHealth` shape exist *only* in `App.tsx`; the backend has no `Profile` or `State` type at all and reaches profile through `as any` at 11 sites. Backend's `Goal.account` is optional where the frontend's is required. Backend's `Commitment` omits `archived`, which it nonetheless writes at `:404`. The shared module must be the union of both, not a copy of either.

Emit the discriminated union from D1 so the eventual split is a schema change. Import by **relative path** — there is no `baseUrl`/`paths` alias in `tsconfig.json` and no `resolve.alias` in `vite.config.ts`.

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

**Neither branch is verifiable from this repo** — the SDK is unvendored, so we cannot confirm which key the error body actually carries. If it emits **neither**, then every server-side validation message is *already* being silently replaced by the generic `"Nothing was changed. Please try again."` today, including the money guardrails. Confirm against the SDK docs while resolving B1.

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

**Three need a human answer before step 4** (D1, D2, D3). This section previously said
"four" while §4 said "two" — the discrepancy was that D4 is explicitly out of scope.
D3 is effectively pre-empted by the audit and handoff, which both assert the
arithmetic must move into SQL as a finding rather than an open question, so only
**D1 and D2 are genuinely undecided.**

A fifth question has surfaced during verification and is unaddressed anywhere in
these docs:

**D5. Supabase or bare Postgres?** The README names Supabase as the portability
target; the brief and audit assume a self-managed Postgres with real FKs and
`ON DELETE RESTRICT`. Supabase implies Row Level Security, which no document
discusses — and RLS interacts directly with the `ownerUserId` → auth-subject-ID
remapping in §5. This needs answering before step 4, not after.

**D1. Split `goals`, or keep it polymorphic?**
*Recommendation: split into `goals` + `commitment_periods`.* Kills the 11 `if (g.commitmentId)` guards, gives periods real columns, and makes `(commitment_id, period_key)` a database-enforced unique constraint — which is what makes cron deduction safe under concurrency rather than guarded in application code.

**Decided 2026-10-05: defer to the Postgres move.** The guards are not removed now — they are *named*. Step 2 emits a discriminated union (`Goal = StandaloneGoal | CommitmentPeriodGoal`, with an `isPeriod()` guard) shared by both sides, so the split becomes a schema migration rather than a ~20-site refactor across two files. Note the guards exist on **both** sides: 11 in `backend/index.ts`, 9 more in `src/App.tsx`.

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
- **`Number(x) <= 0` does not reject `NaN`.** Nine routes guard amounts with this idiom, and `Number('abc')` is `NaN`, where `NaN <= 0` is `false` — so `POST /api/money` with `{"amount":"abc"}` writes `unallocated: NaN` and **permanently breaks the conservation invariant** for that user. Reachable by direct API call; the UI form happens to send `null`, which the guard does catch. Far more corrupting under integer minor units, where everything downstream assumes exactness.
- **XP is not awarded uniformly.** `/api/commitments/rebalance` awards **0** XP while `/api/rebalance` (goal-to-goal) awards 10. A regression test written as "every money movement earns XP" will fail. The per-route table is in the audit.
- **`migrateCommitments()` (`:106`) and `defaults()` (`:29`) are pre-auth migrations.** Postgres gets schema migrations instead.

---

## 8. Reference documents

| Document | Read it for |
| --- | --- |
| [`APPDEPLOY_DECOUPLING_BRIEF.md`](./APPDEPLOY_DECOUPLING_BRIEF.md) | Why the migration. Target architecture, the `Validate → BEGIN → Lock → Update → Event → COMMIT` pattern, and the "decoupling not a rewrite" constraint. |
| [`DECOUPLING_AUDIT.md`](./DECOUPLING_AUDIT.md) | The code as it actually is. All 20 API contracts, the six audit categories, the full 8-step sequence, and both blockers in detail. |
| [`PROBE_B2_COUNTS.md`](./PROBE_B2_COUNTS.md) | The deployable probe that answers B2. **Unrun.** |
| [`README.md`](../README.md) | Product model and the integrity stance. Corrected 2026-10-05: the user-isolation claim was overstated, and the QA section described five scenarios that don't match the six in `tests/tests.json`. |

> **Corrections applied 2026-10-05.** Seven doc errors were found by reading the code against the text and fixed in place: the audit's reconciliation formula omitted the `!commitmentId` filter (manufacturing false discrepancies); its `commitments` schema omitted `archived` (which would make archived commitments editable again); it attributed the XP level formula to `xp()`, which has no level logic; it specified API paging the SDK cannot perform; the README overstated user isolation and misdescribed the test suite; and this file's branch/unpushed metadata and decision count were stale.
