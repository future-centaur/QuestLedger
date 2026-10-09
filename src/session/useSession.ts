import { useEffect, useState } from 'react';
import {
  activeQuests,
  allocatedToActiveQuests,
  archivedQuests,
  levelProgress,
  reservedInCommitments,
  totalHeld,
} from '../../shared/accounting';
import type { Commitment, Goal, State, User } from '../../shared/types';
import { createLedgerApi } from '../api/ledger';
import { errorMessage } from '../client';
import type { OAuthProvider, QuestLedgerClient } from '../client';

export const tabs = [
  ['home', 'Dashboard'],
  ['goals', 'Quests'],
  ['commitments', 'Recurring'],
  ['archive', 'Archives'],
  ['stats', 'Character'],
  ['analysis', 'Analytics'],
] as const;

export type TabId = (typeof tabs)[number][0];

const empty: State = {
  goals: [],
  accounts: [],
  buckets: [],
  commitments: [],
  events: [],
  xp: 0,
  unallocated: 0,
  stats: {
    integrity: 100,
    discipline: 0,
    consistency: 0,
    balance: 50,
    power: 0,
    adaptability: 0,
  },
};

/**
 * Auth, the server snapshot, and the write-then-refetch cycle.
 * Components receive data and callbacks; they do not call the client.
 */
export function useSession(client: QuestLedgerClient) {
  const [user, setUser] = useState<User>(null);
  const [checking, setChecking] = useState(true);
  const [state, setState] = useState(empty);
  const [tab, setTab] = useState<TabId>('home');
  const [modal, setModal] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const api = createLedgerApi(client);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      setError(authError);
      window.history.replaceState(null, '', window.location.pathname);
    }
    client
      .getUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [client]);

  const load = async () => {
    const r = await api.getState();
    setState(r.data);
  };

  useEffect(() => {
    if (user) load().catch(() => setError('Could not load your private data.'));
    // Refetch when the signed-in user changes. `load` closes over the client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await load();
      setModal(null);
      setForm({});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const loginWithProvider = async (provider: OAuthProvider) => {
    setError('');
    try {
      const result = await client.signInWithProvider(provider);
      setUser(result.user);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const loginWithPassword = async (email: string, password: string) => {
    setError('');
    try {
      const r = await client.signInWithPassword(email, password);
      setUser(r.user);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const signUp = async (email: string, password: string) => {
    setError('');
    try {
      const r = await client.signUp(email, password);
      setUser(r.user);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const logout = () => {
    setUser(null);
    setState(empty);
    client.signOut().catch(() => {});
  };

  const progress = levelProgress(state.xp);
  const goalAllocated = allocatedToActiveQuests(state.goals);
  const commitmentReserved = reservedInCommitments(state.commitments);

  const create = () =>
    run(() =>
      api.createGoal({
        name: form.name,
        target: Number(form.target),
        bucket: form.bucket,
        account: form.account,
        deadline: form.deadline || undefined,
        kind: form.kind || 'goal',
      }),
    );

  const allocate = () => run(() => api.contribute(form.goalId, Number(form.amount)));

  const addMoney = () => run(() => api.addMoney(Number(form.amount), form.location || ''));

  const adjust = () =>
    run(() =>
      api.rebalance({
        kind: form.kind || 'transfer',
        from: form.from,
        to: form.to,
        amount: Number(form.amount),
        reason: form.reason || '',
      }),
    );

  const complete = (g: Goal) => run(() => api.completeGoal(g.id));

  const spend = (g: Goal, amount?: number) =>
    run(() => api.spendGoal(g.id, amount || g.saved, form.reason || ''));

  const createCommitment = () =>
    run(() =>
      api.createCommitment({
        name: form.name,
        amount: Number(form.amount),
        frequency: form.frequency,
        dueDay: Number(form.dueDay || 1),
        kind: form.kind || 'expense',
        bucket: form.bucket,
        account: form.account,
      }),
    );

  const movement = () => ({
    id: form.commitmentId,
    amount: Number(form.amount),
    reason: form.reason || '',
    to: form.to,
  });

  const submitCommitment = (kind: 'topup' | 'spend' | 'rebalance' | 'adjust') => {
    if (kind === 'adjust') {
      return run(() =>
        api.adjustCommitment({
          id: form.commitmentId,
          amount: form.amount !== undefined && form.amount !== '' ? Number(form.amount) : undefined,
          frequency: form.frequency !== undefined && form.frequency !== '' ? form.frequency : undefined,
        }),
      );
    }
    const body = movement();
    return run(() =>
      kind === 'topup'
        ? api.topUpCommitment(body)
        : kind === 'spend'
          ? api.spendCommitment(body)
          : api.rebalanceCommitment(body),
    );
  };

  const toggleCommitment = (c: Commitment) => run(() => api.toggleCommitment(c.id, !c.active));

  const updateGoal = () => run(() => api.updateGoal(form));
  const adjustQuestTarget = () =>
    run(() => api.adjustTarget({ id: form.id, target: Number(form.target), releaseTo: form.releaseTo }));
  const archiveQuest = () => run(() => api.archiveGoal({ id: form.id, releaseTo: form.releaseTo }));
  const updateCommitment = () =>
    run(() =>
      api.updateCommitment({
        id: form.id,
        name: form.name,
        bucket: form.bucket,
        account: form.account,
        kind: form.kind,
      }),
    );
  const archiveCommitment = () => run(() => api.archiveCommitment(form.commitmentId));
  const addNamed = (v?: Record<string, string>) =>
    run(() => (modal === 'account' ? api.addAccount(v?.name || '') : api.addBucket(v?.name || '')));

  return {
    user,
    checking,
    state,
    tab,
    setTab,
    modal,
    setModal,
    form,
    setForm,
    busy,
    error,
    setError,
    loginWithProvider,
    loginWithPassword,
    signUp,
    logout,
    xpLevel: progress.level,
    xpIn: progress.into,
    xpPerLevel: progress.perLevel,
    goalAllocated,
    commitmentReserved,
    totalMoney: totalHeld(state.unallocated, state.goals, state.commitments),
    activeGoals: activeQuests(state.goals),
    archives: archivedQuests(state.goals),
    create,
    allocate,
    addMoney,
    adjust,
    complete,
    spend,
    createCommitment,
    submitCommitment,
    toggleCommitment,
    updateGoal,
    adjustQuestTarget,
    archiveQuest,
    updateCommitment,
    archiveCommitment,
    addNamed,
  };
}
