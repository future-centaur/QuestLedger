import type { State } from '../../shared/types';
import type { QuestLedgerClient } from '../client';

/**
 * The HTTP contract the UI is allowed to call. Paths live here so a route
 * rename does not become a search through components.
 */
export function createLedgerApi(client: QuestLedgerClient) {
  return {
    getState: () => client.get<State>('/api/state'),
    addMoney: (amount: string, location: string, source: string) =>
      client.post('/api/money', { amount, location, source }),
    createGoal: (body: Record<string, unknown>) => client.post('/api/goals', body),
    updateGoal: (body: Record<string, unknown>) => client.post('/api/goals/update', body),
    adjustTarget: (body: Record<string, unknown>) => client.post('/api/goals/adjust-target', body),
    archiveGoal: (body: Record<string, unknown>) => client.post('/api/goals/archive', body),
    contribute: (goalId: string, amount: string) => client.post('/api/contributions', { goalId, amount }),
    rebalance: (body: Record<string, unknown>) => client.post('/api/rebalance', body),
    completeGoal: (goalId: string) => client.post('/api/complete', { goalId }),
    spendGoal: (goalId: string, amount: string, reason: string) =>
      client.post('/api/spend', { goalId, amount, reason }),
    recordExpense: (body: {
      amount: string;
      reason: string;
      source: string;
      sourceId?: string;
      closesCycle?: boolean;
    }) => client.post('/api/expenses', body),
    createCommitment: (body: Record<string, unknown>) => client.post('/api/commitments', body),
    topUpCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/topup', body),
    spendCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/spend', body),
    trueUpCommitment: (body: { id: string; periodKey: string; amount: string }) =>
      client.post('/api/commitments/true-up', body),
    rebalanceCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/rebalance', body),
    adjustCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/adjust', body),
    updateCommitment: (body: Record<string, unknown>) => client.post('/api/commitments/update', body),
    toggleCommitment: (id: string, active: boolean) => client.post('/api/commitments/toggle', { id, active }),
    archiveCommitment: (id: string) => client.post('/api/commitments/archive', { id }),
    addAccount: (name: string) => client.post<{ id: string; name: string }>('/api/accounts', { name }),
    addSource: (name: string) => client.post<{ id: string; name: string }>('/api/sources', { name }),
    addBucket: (name: string) => client.post('/api/buckets', { name }),
  };
}

export type LedgerApi = ReturnType<typeof createLedgerApi>;
