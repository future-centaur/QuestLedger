import type { Ledger } from '../domain/ledger';
import type { Outcome } from '../domain/outcome';
import type { RouteHandler } from '../platform';
import { error, json, requireAuth, router } from '../platform';

function respond<T>(outcome: Outcome<T>) {
  return outcome.ok ? json(outcome.data) : error(outcome.message, outcome.status);
}

/**
 * Transport only. Each route authenticates, then calls one ledger command.
 * `handler` is re-exported from `backend/index.ts` under the name the host loads.
 */
export function createHandler(ledger: Ledger) {
  const P = (fn: RouteHandler) => [requireAuth(), fn];
  return router({
    'GET /api/state': P(async (c) => json(await ledger.getState(c.user!.userId))),
    'POST /api/money': P(async (c) => respond(await ledger.addMoney(c.user!.userId, c.body))),
    'POST /api/goals': P(async (c) => respond(await ledger.createGoal(c.user!.userId, c.body))),
    'POST /api/goals/update': P(async (c) => respond(await ledger.updateGoal(c.user!.userId, c.body))),
    'POST /api/goals/adjust-target': P(async (c) => respond(await ledger.adjustTarget(c.user!.userId, c.body))),
    'POST /api/goals/archive': P(async (c) => respond(await ledger.archiveGoal(c.user!.userId, c.body))),
    'POST /api/contributions': P(async (c) => respond(await ledger.contribute(c.user!.userId, c.body))),
    'POST /api/commitments': P(async (c) => respond(await ledger.createCommitment(c.user!.userId, c.body))),
    'POST /api/commitments/topup': P(async (c) => respond(await ledger.topUpCommitment(c.user!.userId, c.body))),
    'POST /api/commitments/spend': P(async (c) => respond(await ledger.spendCommitment(c.user!.userId, c.body))),
    'POST /api/commitments/rebalance': P(async (c) =>
      respond(await ledger.rebalanceCommitment(c.user!.userId, c.body)),
    ),
    'POST /api/commitments/toggle': P(async (c) => respond(await ledger.toggleCommitment(c.user!.userId, c.body))),
    'POST /api/commitments/adjust': P(async (c) => respond(await ledger.adjustCommitment(c.user!.userId, c.body))),
    'POST /api/commitments/update': P(async (c) => respond(await ledger.updateCommitment(c.user!.userId, c.body))),
    'POST /api/commitments/archive': P(async (c) =>
      respond(await ledger.archiveCommitment(c.user!.userId, c.body)),
    ),
    'POST /api/complete': P(async (c) => respond(await ledger.completeGoal(c.user!.userId, c.body))),
    'POST /api/spend': P(async (c) => respond(await ledger.spendGoal(c.user!.userId, c.body))),
    'POST /api/rebalance': P(async (c) => respond(await ledger.rebalance(c.user!.userId, c.body))),
    'POST /api/accounts': P(async (c) => respond(await ledger.addAccount(c.user!.userId, c.body))),
    'POST /api/buckets': P(async (c) => respond(await ledger.addBucket(c.user!.userId, c.body))),
  });
}
