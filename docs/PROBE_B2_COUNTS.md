# Probe — B2 real row counts

**Status: unrun.** This is a probe *you* execute on the platform. Nothing here has
been run; the numbers are unknown. Delete this file once counts are known.

`db.list` truncates silently and there is no count API, but truncation is
**detectable**: if `items.length === limit`, more rows exist. Escalate until a call
returns fewer rows than requested — that count is exact.

## How to run

1. Paste the route below into `backend/index.ts`, inside `router({ ... })`.
2. Deploy to AppDeploy.
3. As a signed-in user, `GET /api/__probe/counts`.
4. **Delete the route and redeploy.** It exposes no user data (ids and totals only),
   but it should not ship.
5. Paste the response back.

## The route

```ts
  'GET /api/__probe/counts': P(async () => {
    const out: Record<string, unknown> = {};
    for (const t of tables) {
      const ladder = [100, 250, 500, 1000, 2500, 5000];
      let count = null, truncatedAt = null;
      for (const n of ladder) {
        const r = await db.list<Owned>(t, { limit: n });
        if (r.items.length < n) { count = r.items.length; break; }
        truncatedAt = n;
      }
      out[t] = count === null ? { count: `>${truncatedAt}`, truncated: true } : { count, truncated: false };
    }
    // per-user extremes, filtered so each user is counted independently
    const perUser: Record<string, unknown> = {};
    for (const t of ['goals', 'events', 'commitments']) {
      const owners = new Map<string, number>();
      const r = await db.list<Owned>(t, { limit: 5000 });
      for (const row of r.items) if (row.ownerUserId) owners.set(row.ownerUserId, (owners.get(row.ownerUserId) || 0) + 1);
      const counts = [...owners.values()];
      perUser[t] = {
        users: counts.length,
        max: counts.length ? Math.max(...counts) : 0,
        overCap: t === 'events' ? counts.filter(c => c > 200).length : counts.filter(c => c > 100).length,
      };
    }
    return json({ totals: out, perUser, at: new Date().toISOString() });
  }),
```

## Reading the result

| Result | Consequence |
| --- | --- |
| Any table `truncated: true` | **Data is already being dropped in production.** Treat as an incident, not a migration concern — and the export needs direct DB access, because the API cannot return what it will not serve. |
| All `truncated: false`, all `overCap: 0` | Caps are latent, not active. Cheap to fix pre-migration; no data has been lost. |
| Any `perUser.overCap > 0` | **Correctness guards are already degrading for real users** — see below. |

`perUser` is the field that matters most. The totals can look healthy while
individual users are over cap, because the caps are applied per user.

## If `overCap > 0`, this is not cosmetic

The caps bound correctness guards, not just display:

- **`ensureInstances` (`backend/index.ts:93`, goals cap 100)** checks for an
  existing period row before inserting. Past 100 rows it cannot see the row, so it
  inserts a **duplicate** period for the same `(commitmentId, periodKey)`.
- **`deductCommitment` (`:184`, events cap 200)** dedupes deductions the same way.
  Past 200 events the idempotency check stops finding prior deductions — **the
  guard against double deduction silently degrades.**
- **`:201` (profiles cap 500)** stops the cron entirely past the 500th profile.
  Those users' commitments are never deducted.

## Two things to check while you are there

**`fundingMigrated` drift.** `POST /api/commitments` landed in `bbf8c23`. Any
commitment created before that fix may lack `fundingMigrated: true`, which is the
flag that stops `migrateCommitments()` re-sweeping it after import — it would fold
goal allocations into the balance a second time. Add this to the probe if you want
the answer in the same round trip:

```ts
    const cmts = await db.list<any>('commitments', { limit: 5000 });
    out.unmigratedCommitments = cmts.items.filter(c => c.fundingMigrated !== true).length;
```

**B1, reframed.** The handoff asks whether multi-record `db.update` is atomic. That
is the wrong question — `/api/contributions:290` writes `profile` and `:291` writes
the goal in *separate* calls, so per-call atomicity would not save it. The decisive
question is:

> Does `@appdeploy/sdk` expose any transaction primitive at all?

Check the SDK surface for `transaction` / `begin` / `sql` / a raw-query export.
**No** → B1 is moot, no route can be made atomic on this platform, and the migration
is forced regardless of the `:357` answer. **Yes** → the atomicity question becomes
cheap, and the correct near-term fix is available before Postgres.

## Also unverifiable from this repo

Both `mutate()` contracts are guesses, because the SDK is not vendored:

- `App.tsx:27` reads `e.response.data.message || e.response.data.error`. If the SDK
  emits **neither** key, every server-side validation message is *already* being
  replaced by the generic `"Nothing was changed. Please try again."` — including the
  money guardrails. Worth confirming against the SDK docs.
- `App.tsx:23` branches on untyped codes `popup_blocked` / `popup_closed`.