import type { State } from '../../shared/types';
import type { QuestLedgerClient } from '../client';

/**
 * The HTTP contract the UI is allowed to call. Paths live here so a route
 * rename does not become a search through components.
 */
export function createLedgerApi(client: QuestLedgerClient) {
  return {
    getState: () => client.get<State>('/api/state'),
    addMoney: (amount: number, location: string) => client.post('/api/money', { amount, location }),
    createGoal: (body: Record<string, unknown>) => client.post('/api/goals', body),
    updateGoal: (body: Record<string, unknown>) => client.post('/api/goals/update', body),
    adjustTarget: (body: Record<string, unknown>) => client.post('/api/goals/adjust-target', body),
    archiveGoal: (body: Record<string, unknown>) => client.post('/api/goals/archive', body),
    contribute: (goalId: string, amount: number) => client.post('/api/contributions', { goalId, amount }),
    rebalance: (body: Record<string, unknown>) => client.post('/api/rebalance', body),
    completeGoal: (goalId: string) => client.post('/api/complete', { goalId }),
    spendGoal: (goalId: string, amount: number, reason: string) =>
      client.post('/api/spend', { goalId, amount, reason }),
    createCommitment: (body: Record<string, unknown>) => client.post('/api/commitments', body),
    topUpCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/topup', body),
    spendCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/spend', body),
    rebalanceCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/rebalance', body),
    adjustCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/adjust', body),
    updateCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/update', body),
    toggleCommitment: (id: string, active: boolean) => client.post('/api/commitments/toggle', { id, active }),
    archiveCommitment: (id: string) => client.post('/api/commitments/archive', { id }),
    addAccount: (name: string) => client.post('/api/accounts', { name }),
    addBucket: (name: string) => client.post('/api/buckets', { name }),
  };
}

export type LedgerApi = ReturnType<typeof createLedgerApi>;
