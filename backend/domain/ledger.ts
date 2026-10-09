import {
  defaultAccounts,
  defaultBuckets,
  listLimits,
} from '../../shared/config';
import {
  allocatedToQuests,
  characterStats,
  monthlyOutflow,
  reservedInCommitments,
} from '../../shared/accounting';
import { parsePositive } from '../../shared/money';
import { isPeriod } from '../../shared/types';
import type { Commitment, Event, Goal, NewCommitment, Profile } from '../../shared/types';
import type { LedgerStore } from '../store';
import { fail, ok } from './outcome';
import type { Outcome } from './outcome';
import { duePeriodKey, nextDueAt, validFrequency } from './schedule';

type Owned = { id?: string; ownerUserId?: string };

export type CronEvent = {
  type: 'cron';
  name: string;
  invocationId: string;
  scheduledTime: string;
};

/** Application service. HTTP and the cron entrypoint call this. */
export function createLedger(store: LedgerStore) {
  async function defaults(userId: string) {
    const b = await store.list('buckets', { limit: listLimits.buckets, filter: { ownerUserId: userId } });
    if (!b.items.length)
      await store.add(
        'buckets',
        defaultBuckets.map((name) => ({ name, ownerUserId: userId })),
      );
    const a = await store.list('accounts', { limit: listLimits.accounts, filter: { ownerUserId: userId } });
    if (!a.items.length)
      await store.add(
        'accounts',
        defaultAccounts.map((name) => ({ name, ownerUserId: userId })),
      );
    const p = await store.list('profile', { limit: listLimits.profile, filter: { ownerUserId: userId } });
    if (!p.items.length) await store.add('profile', [{ xp: 0, unallocated: 0, ownerUserId: userId }]);
  }

  async function xp(uid: string, n: number) {
    const r = await store.list<Profile>('profile', { limit: listLimits.profile, filter: { ownerUserId: uid } });
    const p = r.items[0];
    if (p) await store.update('profile', [{ id: p.id, record: { ...p, xp: (p.xp || 0) + n } }]);
  }

  async function profile(uid: string) {
    const r = await store.list<Profile>('profile', { limit: listLimits.profile, filter: { ownerUserId: uid } });
    return r.items[0];
  }

  async function ensureInstances(uid: string, commitments: Array<Commitment & { id: string }>) {
    const goals = await store.list<Goal>('goals', { limit: listLimits.goals, filter: { ownerUserId: uid } });
    for (const c of commitments.filter((x) => x.active)) {
      const key = duePeriodKey(c, new Date(c.nextDueAt || nextDueAt(c)));
      const exists = goals.items.some((g) => g.commitmentId === c.id && g.periodKey === key);
      if (!exists) {
        await store.add('goals', [
          {
            name: c.name + ' · ' + key,
            target: c.amount,
            saved: 0,
            spent: 0,
            bucket: c.bucket,
            account: c.account || '',
            status: 'active',
            kind: c.kind,
            commitmentId: c.id,
            periodKey: key,
            periodStatus: 'pending',
            ownerUserId: uid,
          },
        ]);
      }
    }
  }

  async function migrateCommitments(uid: string, commitments: Array<Commitment & { id: string }>) {
    const goals = await store.list<Goal>('goals', { limit: listLimits.goals, filter: { ownerUserId: uid } });
    for (const c of commitments) {
      if (c.fundingMigrated === true) continue;
      const linked = goals.items.filter((g) => g.commitmentId === c.id);
      const oldAllocated = linked.reduce((s, g) => s + Number(g.saved || 0), 0);
      const balance = Number(c.balance || 0) + oldAllocated;
      const updated = { ...c, balance, nextDueAt: c.nextDueAt || nextDueAt(c), fundingMigrated: true };
      await store.update('commitments', [{ id: c.id, record: updated }]);
      if (oldAllocated > 0) {
        await store.update(
          'goals',
          linked.map((g) => ({ id: g.id, record: { ...g, saved: 0, periodStatus: 'migrated_to_commitment' } })),
        );
        await store.add('events', [
          {
            type: 'commitment_migration',
            commitmentId: c.id,
            amount: oldAllocated,
            reason: 'Existing recurring quest allocation moved to commitment balance',
            createdAt: new Date().toISOString(),
            ownerUserId: uid,
          },
        ]);
      }
    }
  }

  async function commitmentList(uid: string) {
    const r = await store.list<Commitment>('commitments', {
      limit: listLimits.commitments,
      filter: { ownerUserId: uid },
    });
    return r.items.map((c) => ({ ...c, balance: Number(c.balance || 0), nextDueAt: c.nextDueAt || nextDueAt(c) }));
  }

  /** Writes that `GET /api/state` still performs. `readState` does not write. */
  async function bootstrapUser(uid: string) {
    await defaults(uid);
    let commitments = await commitmentList(uid);
    await migrateCommitments(uid, commitments as Array<Commitment & { id: string }>);
    commitments = await commitmentList(uid);
    await ensureInstances(uid, commitments as Array<Commitment & { id: string }>);
  }

  async function readState(uid: string) {
    const [g, b, a, e, p, c] = await Promise.all([
      store.list<Goal>('goals', { limit: listLimits.goals, filter: { ownerUserId: uid } }),
      store.list('buckets', { limit: listLimits.buckets, filter: { ownerUserId: uid } }),
      store.list('accounts', { limit: listLimits.accounts, filter: { ownerUserId: uid } }),
      store.list<Event>('events', { limit: listLimits.events, filter: { ownerUserId: uid } }),
      store.list<Profile>('profile', { limit: listLimits.profile, filter: { ownerUserId: uid } }),
      store.list<Commitment>('commitments', { limit: listLimits.commitments, filter: { ownerUserId: uid } }),
    ]);
    const names = new Map(g.items.map((x) => [x.id, x.name]));
    const events = e.items.map((x) => ({
      ...x,
      fromName: x.from ? names.get(x.from) : undefined,
      toName: x.to ? names.get(x.to) : undefined,
    }));
    const commitments = c.items.map((x) => ({
      ...x,
      balance: Number(x.balance || 0),
      nextDueAt: x.nextDueAt || nextDueAt(x),
    }));
    const goalAllocated = allocatedToQuests(g.items);
    const commitmentReserved = reservedInCommitments(c.items);
    const prof = p.items[0];
    const unallocated = Number(prof?.unallocated || 0);
    return {
      goals: g.items,
      accounts: a.items,
      buckets: b.items,
      commitments,
      events,
      unallocated,
      xp: prof?.xp || 0,
      stats: characterStats({
        goals: g.items,
        buckets: b.items,
        events,
        goalAllocated,
        commitmentReserved,
        unallocated,
      }),
      recurringHealth: {
        totalReserved: commitmentReserved,
        monthlyOutflow: monthlyOutflow(c.items),
        activeCount: c.items.filter((x) => x.active).length,
      },
    };
  }

  async function getState(uid: string) {
    await bootstrapUser(uid);
    return readState(uid);
  }

  async function changeGoal(uid: string, id: string, delta: number) {
    const [g] = await store.get<Goal>('goals', [id]);
    if (!g || g.ownerUserId !== uid || g.saved + delta < 0) return false;
    return (await store.update('goals', [{ id, record: { ...g, saved: g.saved + delta } }]))[0];
  }

  async function getCommitment(uid: string, id: string) {
    const [c] = await store.get<Commitment>('commitments', [id]);
    return c && c.ownerUserId === uid ? c : null;
  }

  async function event(uid: string, record: Omit<Event, 'id' | 'ownerUserId'>) {
    const [id] = await store.add('events', [{ ...record, ownerUserId: uid }]);
    return id;
  }

  async function deductCommitment(uid: string, c: Commitment & { id: string }, due: Date) {
    const goals = await store.list<Goal>('goals', { limit: listLimits.goals, filter: { ownerUserId: uid } });
    const key = duePeriodKey(c, due);
    const instance = goals.items.find((g) => g.commitmentId === c.id && g.periodKey === key);
    const prior = await store.list<Event>('events', { limit: listLimits.events, filter: { ownerUserId: uid } });
    const already = prior.items.some(
      (e) => e.type === 'commitment_deduction' && e.commitmentId === c.id && e.reason === 'period:' + key,
    );
    if (already) return false;
    const dueAmount = Number(c.pendingAmount ?? c.amount);
    const balance = Number(c.balance || 0);
    const amount = Math.min(balance, dueAmount);
    const underfunded = amount < dueAmount;
    const next = {
      ...c,
      balance: balance - amount,
      nextDueAt: nextDueAt(
        { ...c, amount: c.pendingAmount ?? c.amount, frequency: c.pendingFrequency ?? c.frequency },
        due,
      ),
      amount: c.pendingAmount ?? c.amount,
      frequency: c.pendingFrequency ?? c.frequency,
      pendingAmount: undefined,
      pendingFrequency: undefined,
    };
    await store.update('commitments', [{ id: c.id, record: next }]);
    await event(uid, {
      type: 'commitment_deduction',
      amount,
      commitmentId: c.id,
      reason: 'period:' + key,
      createdAt: new Date().toISOString(),
    });
    if (instance) {
      await store.update('goals', [
        {
          id: instance.id,
          record: {
            ...instance,
            saved: 0,
            spent: amount,
            status: underfunded ? 'active' : 'completed',
            periodStatus: underfunded ? 'underfunded' : 'spent',
          },
        },
      ]);
    }
    if (amount > 0) await xp(uid, underfunded ? 3 : 20);
    return true;
  }

  async function processCommitments(_event: CronEvent) {
    const users = await store.list<Owned>('profile', { limit: listLimits.cronProfiles });
    for (const owner of users.items) {
      if (!owner.ownerUserId) continue;
      const commitments = await commitmentList(owner.ownerUserId);
      const now = new Date();
      for (const c of commitments.filter((x) => x.active && x.nextDueAt && new Date(x.nextDueAt) <= now)) {
        await deductCommitment(owner.ownerUserId, c as Commitment & { id: string }, new Date(c.nextDueAt!));
      }
    }
    return { statusCode: 200 };
  }

  async function addMoney(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const n = parsePositive(body.amount);
    if (n === null) return fail('Enter a positive amount', 400);
    const p = await profile(uid);
    if (!p) return fail('Profile unavailable', 500);
    const updated = await store.update('profile', [
      { id: p.id, record: { ...p, unallocated: Number(p.unallocated || 0) + n } },
    ]);
    if (!updated[0]) return fail('Could not add money', 500);
    const id = await event(uid, {
      type: 'money_added',
      amount: n,
      location: body.location || '',
      createdAt: new Date().toISOString(),
    });
    if (!id) return fail('Money was added but its history event failed', 500);
    await xp(uid, 2);
    return ok({ ok: true });
  }

  async function createGoal(uid: string, body: any): Promise<Outcome<{ id: string }>> {
    const n = parsePositive(body.target);
    if (!body.name || n === null || !body.bucket) return fail('Missing required quest fields', 400);
    const [id] = await store.add('goals', [
      {
        name: body.name,
        target: n,
        saved: 0,
        spent: 0,
        bucket: body.bucket,
        account: body.account || '',
        deadline: body.deadline,
        status: 'active',
        kind: body.kind === 'expense' ? 'expense' : 'goal',
        ownerUserId: uid,
      },
    ]);
    return id ? ok({ id }) : fail('Could not create quest', 500);
  }

  async function updateGoal(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const [g] = await store.get<Goal>('goals', [body.id]);
    if (!g || g.ownerUserId !== uid || isPeriod(g) || g.status === 'archived')
      return fail('Quest cannot be edited', 400);
    if (!body.name || !body.bucket) return fail('Quest name and bucket are required', 400);
    const record = {
      ...g,
      name: body.name,
      bucket: body.bucket,
      account: body.account || '',
      deadline: body.deadline || undefined,
      kind: body.kind === 'expense' ? 'expense' : 'goal',
    };
    await store.update('goals', [{ id: g.id, record }]);
    await event(uid, {
      type: 'goal_updated',
      goalId: g.id,
      amount: 0,
      reason: 'Quest details updated',
      createdAt: new Date().toISOString(),
    });
    return ok({ ok: true });
  }

  async function adjustTarget(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const n = parsePositive(body.target);
    const [g] = await store.get<Goal>('goals', [body.id]);
    if (!g || g.ownerUserId !== uid || isPeriod(g) || g.status === 'archived')
      return fail('Quest cannot be adjusted', 400);
    if (n === null) return fail('Target must be positive', 400);
    const excess = Math.max(0, Number(g.saved || 0) - n);
    if (excess > 0) {
      if (!body.releaseTo)
        return fail(
          `The new target releases ${excess.toLocaleString()} from this quest. Choose where that money goes.`,
          400,
        );
      if (body.releaseTo === 'unallocated') {
        const p = await profile(uid);
        if (!p) return fail('Profile unavailable', 500);
        await store.update('profile', [
          { id: p.id, record: { ...p, unallocated: Number(p.unallocated || 0) + excess } },
        ]);
      } else {
        const [destination] = await store.get<Goal>('goals', [body.releaseTo]);
        if (
          !destination ||
          destination.ownerUserId !== uid ||
          isPeriod(destination) ||
          destination.status === 'archived' ||
          destination.id === g.id
        )
          return fail('Choose a valid destination quest', 400);
        await changeGoal(uid, destination.id, excess);
        await event(uid, {
          type: 'transfer',
          from: g.id,
          to: destination.id,
          amount: excess,
          reason: 'Excess released by target reduction',
          createdAt: new Date().toISOString(),
        });
      }
    }
    await store.update('goals', [{ id: g.id, record: { ...g, target: n, saved: Number(g.saved || 0) - excess } }]);
    await event(uid, {
      type: 'goal_target_change',
      goalId: g.id,
      amount: n,
      reason: `Target changed from ${g.target} to ${n}${excess ? `; ${excess} released` : ''}`,
      createdAt: new Date().toISOString(),
    });
    return ok({ ok: true });
  }

  async function archiveGoal(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const [g] = await store.get<Goal>('goals', [body.id]);
    if (!g || g.ownerUserId !== uid || isPeriod(g) || g.status === 'archived')
      return fail('Quest cannot be archived', 400);
    const balance = Number(g.saved || 0);
    if (balance > 0) {
      if (!body.releaseTo)
        return fail(`Reallocate the remaining ${balance.toLocaleString()} before archiving`, 400);
      if (body.releaseTo === 'unallocated') {
        const p = await profile(uid);
        if (!p) return fail('Profile unavailable', 500);
        await store.update('profile', [
          { id: p.id, record: { ...p, unallocated: Number(p.unallocated || 0) + balance } },
        ]);
      } else {
        const [destination] = await store.get<Goal>('goals', [body.releaseTo]);
        if (
          !destination ||
          destination.ownerUserId !== uid ||
          isPeriod(destination) ||
          destination.status === 'archived' ||
          destination.id === g.id
        )
          return fail('Choose a valid destination quest', 400);
        await changeGoal(uid, destination.id, balance);
        await event(uid, {
          type: 'transfer',
          from: g.id,
          to: destination.id,
          amount: balance,
          reason: 'Allocation moved before quest archive',
          createdAt: new Date().toISOString(),
        });
      }
    }
    await store.update('goals', [{ id: g.id, record: { ...g, saved: 0, status: 'archived', archived: true } }]);
    await event(uid, {
      type: 'goal_archive',
      goalId: g.id,
      amount: balance,
      createdAt: new Date().toISOString(),
      reason: balance ? 'Remaining allocation reallocated before archive' : 'Quest archived',
    });
    return ok({ ok: true });
  }

  async function contribute(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const n = parsePositive(body.amount);
    if (!body.goalId || n === null) return fail('Invalid allocation', 400);
    const p = await profile(uid);
    const available = Number(p?.unallocated || 0);
    if (!p || n > available) return fail('Not enough unallocated money', 400);
    const [g] = await store.get<Goal>('goals', [body.goalId]);
    if (!g || g.ownerUserId !== uid || g.status === 'archived' || isPeriod(g))
      return fail('Quest is not available for allocation', 400);
    await store.update('profile', [{ id: p.id, record: { ...p, unallocated: available - n } }]);
    if (!(await changeGoal(uid, body.goalId, n))) return fail('Could not update quest', 500);
    const id = await event(uid, {
      type: 'contribution',
      goalId: body.goalId,
      amount: n,
      createdAt: new Date().toISOString(),
    });
    if (!id) return fail('Allocation was not recorded', 500);
    await xp(uid, 5);
    return ok({ ok: true });
  }

  async function createCommitment(uid: string, body: any): Promise<Outcome<{ id: string }>> {
    const n = parsePositive(body.amount);
    const frequency = String(body.frequency || '');
    const dueDay = Number(body.dueDay || 1);
    if (!body.name || n === null || !validFrequency(frequency) || !body.bucket)
      return fail('Missing required commitment fields', 400);
    if (
      (frequency === 'monthly' || frequency === 'yearly') &&
      (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31)
    )
      return fail('Due day must be between 1 and 31', 400);
    const kind = body.kind === 'goal' ? 'goal' : 'expense';
    const seed = {
      name: body.name,
      amount: n,
      frequency,
      dueDay,
      kind,
      bucket: body.bucket,
      account: body.account || '',
      active: true,
      ownerUserId: uid,
    } as Commitment;
    const record: NewCommitment = {
      name: body.name,
      amount: n,
      frequency,
      dueDay: frequency === 'monthly' || frequency === 'yearly' ? dueDay : undefined,
      kind,
      bucket: body.bucket,
      account: body.account || '',
      active: true,
      balance: 0,
      nextDueAt: nextDueAt(seed),
      fundingMigrated: true,
      ownerUserId: uid,
    };
    const [id] = await store.add('commitments', [record]);
    if (!id) return fail('Could not create commitment', 500);
    await event(uid, {
      type: 'commitment_created',
      commitmentId: id,
      amount: n,
      createdAt: new Date().toISOString(),
    });
    return ok({ id });
  }

  async function topUpCommitment(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const n = parsePositive(body.amount);
    if (!body.id || n === null) return fail('Enter a positive top-up amount', 400);
    const cmt = await getCommitment(uid, body.id);
    if (!cmt) return fail('Commitment not found', 404);
    const p = await profile(uid);
    const available = Number(p?.unallocated || 0);
    if (!p || n > available) return fail('Not enough unallocated money', 400);
    await store.update('profile', [{ id: p.id, record: { ...p, unallocated: available - n } }]);
    await store.update('commitments', [{ id: cmt.id, record: { ...cmt, balance: Number(cmt.balance || 0) + n } }]);
    const id = await event(uid, {
      type: 'commitment_top_up',
      commitmentId: cmt.id,
      amount: n,
      createdAt: new Date().toISOString(),
    });
    if (!id) return fail('Top-up was not recorded', 500);
    await xp(uid, 5);
    return ok({ ok: true });
  }

  async function spendCommitment(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const n = parsePositive(body.amount);
    if (!body.id || n === null) return fail('Enter a valid spending amount', 400);
    const cmt = await getCommitment(uid, body.id);
    if (!cmt || n > Number(cmt.balance || 0)) return fail('Spending exceeds the reserved balance', 400);
    await store.update('commitments', [{ id: cmt.id, record: { ...cmt, balance: Number(cmt.balance || 0) - n } }]);
    const id = await event(uid, {
      type: 'commitment_spend',
      commitmentId: cmt.id,
      amount: n,
      reason: body.reason || '',
      createdAt: new Date().toISOString(),
    });
    if (!id) return fail('Spending was not recorded', 500);
    await xp(uid, 10);
    return ok({ ok: true });
  }

  async function rebalanceCommitment(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const n = parsePositive(body.amount);
    if (!body.id || n === null) return fail('Enter a valid amount', 400);
    const cmt = await getCommitment(uid, body.id);
    if (!cmt || n > Number(cmt.balance || 0)) return fail('Not enough commitment balance', 400);
    if (body.to === 'unallocated') {
      const p = await profile(uid);
      if (!p) return fail('Profile unavailable', 500);
      await store.update('commitments', [{ id: cmt.id, record: { ...cmt, balance: Number(cmt.balance || 0) - n } }]);
      await store.update('profile', [{ id: p.id, record: { ...p, unallocated: Number(p.unallocated || 0) + n } }]);
      const id = await event(uid, {
        type: 'commitment_rebalance',
        commitmentId: cmt.id,
        amount: n,
        to: 'unallocated',
        reason: body.reason || '',
        createdAt: new Date().toISOString(),
      });
      if (!id) return fail('Rebalance was not recorded', 500);
      return ok({ ok: true });
    }
    const target = await getCommitment(uid, body.to);
    if (!target || target.id === cmt.id) return fail('Choose another commitment', 400);
    await store.update('commitments', [
      { id: cmt.id, record: { ...cmt, balance: Number(cmt.balance || 0) - n } },
      { id: target.id, record: { ...target, balance: Number(target.balance || 0) + n } },
    ]);
    const id = await event(uid, {
      type: 'commitment_rebalance',
      commitmentId: cmt.id,
      to: target.id,
      amount: n,
      reason: body.reason || '',
      createdAt: new Date().toISOString(),
    });
    if (!id) return fail('Rebalance was not recorded', 500);
    return ok({ ok: true });
  }

  async function toggleCommitment(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const cmt = await getCommitment(uid, body.id);
    if (!cmt) return fail('Commitment not found', 404);
    const active = Boolean(body.active);
    await store.update('commitments', [{ id: cmt.id, record: { ...cmt, active } }]);
    await event(uid, {
      type: active ? 'commitment_resume' : 'commitment_pause',
      commitmentId: cmt.id,
      amount: 0,
      createdAt: new Date().toISOString(),
    });
    return ok({ ok: true });
  }

  async function adjustCommitment(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const cmt = await getCommitment(uid, body.id);
    if (!cmt) return fail('Commitment not found', 404);
    const record: any = { ...cmt };
    if (body.amount !== undefined && body.amount !== '') {
      const n = parsePositive(body.amount);
      if (n === null) return fail('Amount must be positive', 400);
      record.pendingAmount = n;
    }
    if (body.frequency !== undefined && body.frequency !== '') {
      if (!validFrequency(body.frequency)) return fail('Invalid frequency', 400);
      record.pendingFrequency = body.frequency;
    }
    if (record.pendingAmount === undefined && record.pendingFrequency === undefined)
      return fail('No change supplied', 400);
    await store.update('commitments', [{ id: cmt.id, record }]);
    if (body.amount !== undefined && body.amount !== '')
      await event(uid, {
        type: 'commitment_amount_change',
        commitmentId: cmt.id,
        amount: Number(body.amount),
        reason: 'Effective next cycle',
        createdAt: new Date().toISOString(),
      });
    if (body.frequency !== undefined && body.frequency !== '')
      await event(uid, {
        type: 'commitment_frequency_change',
        commitmentId: cmt.id,
        amount: 0,
        reason: 'Effective next cycle',
        createdAt: new Date().toISOString(),
      });
    return ok({ ok: true });
  }

  async function updateCommitment(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const cmt = await getCommitment(uid, body.id);
    if (!cmt || cmt.archived) return fail('Commitment cannot be edited', 400);
    if (!body.name || !body.bucket) return fail('Name and bucket are required', 400);
    const record = {
      ...cmt,
      name: body.name,
      bucket: body.bucket,
      account: body.account || '',
      kind: body.kind === 'goal' ? 'goal' : 'expense',
    };
    await store.update('commitments', [{ id: cmt.id, record }]);
    await event(uid, {
      type: 'commitment_updated',
      commitmentId: cmt.id,
      amount: 0,
      reason: 'Commitment details updated',
      createdAt: new Date().toISOString(),
    });
    return ok({ ok: true });
  }

  async function archiveCommitment(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const cmt = await getCommitment(uid, body.id);
    if (!cmt) return fail('Commitment not found', 404);
    if (Number(cmt.balance || 0) > 0) return fail('Reallocate the remaining balance before archiving', 400);
    await store.update('commitments', [{ id: cmt.id, record: { ...cmt, active: false, archived: true } }]);
    await event(uid, {
      type: 'commitment_archive',
      commitmentId: cmt.id,
      amount: 0,
      createdAt: new Date().toISOString(),
    });
    return ok({ ok: true });
  }

  async function completeGoal(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const [g] = await store.get<Goal>('goals', [body.goalId]);
    if (!g || g.ownerUserId !== uid || isPeriod(g) || g.status !== 'active' || g.saved < g.target)
      return fail('Quest is not ready to complete', 400);
    await store.update('goals', [{ id: g.id, record: { ...g, status: 'completed' } }]);
    await event(uid, {
      type: 'completion',
      goalId: g.id,
      amount: g.target,
      createdAt: new Date().toISOString(),
    });
    await xp(uid, 100);
    return ok({ ok: true });
  }

  async function spendGoal(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const n = parsePositive(body.amount);
    if (!body.goalId || n === null) return fail('Enter a valid spending amount', 400);
    const [g] = await store.get<Goal>('goals', [body.goalId]);
    if (!g || g.ownerUserId !== uid || isPeriod(g) || g.status === 'archived' || n > g.saved)
      return fail('Spending exceeds the remaining allocation', 400);
    const remaining = g.saved - n;
    const spent = (g.spent || 0) + n;
    const status = remaining === 0 ? 'archived' : g.status;
    await store.update('goals', [{ id: g.id, record: { ...g, saved: remaining, spent, status } }]);
    const id = await event(uid, {
      type: 'spend',
      goalId: g.id,
      amount: n,
      reason: body.reason || '',
      createdAt: new Date().toISOString(),
    });
    if (!id) return fail('Spending was not recorded', 500);
    await xp(uid, 10);
    return ok({ ok: true });
  }

  async function rebalance(uid: string, body: any): Promise<Outcome<{ ok: true }>> {
    const n = parsePositive(body.amount);
    if (!body.from || n === null) return fail('Choose a source quest and positive amount', 400);
    if (!(await changeGoal(uid, body.from, -n))) return fail('The source quest does not have enough allocation', 400);
    if (body.kind === 'transfer') {
      if (!body.to || body.to === body.from || !(await changeGoal(uid, body.to, n))) {
        await changeGoal(uid, body.from, n);
        return fail('Choose a different valid destination quest', 400);
      }
      const id = await event(uid, {
        type: 'transfer',
        from: body.from,
        to: body.to,
        amount: n,
        reason: body.reason || '',
        createdAt: new Date().toISOString(),
      });
      if (!id) return fail('Transfer was not recorded', 500);
    } else {
      const id = await event(uid, {
        type: body.kind === 'expense' ? 'expense' : 'withdrawal',
        goalId: body.from,
        amount: n,
        reason: body.reason || '',
        createdAt: new Date().toISOString(),
      });
      if (!id) return fail('Adjustment was not recorded', 500);
    }
    await xp(uid, 10);
    return ok({ ok: true });
  }

  async function addAccount(uid: string, body: any): Promise<Outcome<{ id: string }>> {
    if (!body.name) return fail('Account name required', 400);
    const [id] = await store.add('accounts', [{ name: body.name, ownerUserId: uid }]);
    return id ? ok({ id }) : fail('Could not add account', 500);
  }

  async function addBucket(uid: string, body: any): Promise<Outcome<{ id: string }>> {
    if (!body.name) return fail('Bucket name required', 400);
    const [id] = await store.add('buckets', [{ name: body.name, ownerUserId: uid }]);
    return id ? ok({ id }) : fail('Could not add bucket', 500);
  }

  return {
    getState,
    processCommitments,
    addMoney,
    createGoal,
    updateGoal,
    adjustTarget,
    archiveGoal,
    contribute,
    createCommitment,
    topUpCommitment,
    spendCommitment,
    rebalanceCommitment,
    toggleCommitment,
    adjustCommitment,
    updateCommitment,
    archiveCommitment,
    completeGoal,
    spendGoal,
    rebalance,
    addAccount,
    addBucket,
  };
}

export type Ledger = ReturnType<typeof createLedger>;
