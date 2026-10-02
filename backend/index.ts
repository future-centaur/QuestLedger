import { router, json, error, db, requireAuth } from '@appdeploy/sdk';

type Goal = {
  id?: string; name: string; target: number; saved: number; spent: number;
  bucket: string; account?: string; deadline?: string; status: string; kind: 'goal' | 'expense';
  ownerUserId: string; commitmentId?: string; periodKey?: string; periodStatus?: string; archived?: boolean;
};
type Commitment = {
  id?: string; name: string; amount: number; frequency: string; dueDay?: number;
  kind: 'goal' | 'expense'; bucket: string; account?: string; active: boolean;
  balance?: number; nextDueAt?: string; pendingAmount?: number; pendingFrequency?: string;
  fundingMigrated?: boolean; ownerUserId: string;
};
type Event = {
  id?: string; type: string; amount: number; from?: string; to?: string; goalId?: string;
  commitmentId?: string; createdAt: string; reason?: string; location?: string;
  fromName?: string; toName?: string; ownerUserId: string;
};
type Owned = { ownerUserId?: string };
const tables = ['goals', 'accounts', 'buckets', 'events', 'profile', 'commitments'];

async function claim(userId: string) {
  for (const t of tables) {
    const r = await db.list<Owned>(t, { limit: 100 });
    const legacy = r.items.filter(x => !x.ownerUserId);
    if (legacy.length) await db.update(t, legacy.map(x => ({ id: x.id, record: { ...x, ownerUserId: userId } })));
  }
}
async function defaults(userId: string) {
  await claim(userId);
  const b = await db.list('buckets', { limit: 50, filter: { ownerUserId: userId } });
  if (!b.items.length) await db.add('buckets', [
    { name: 'Necessities', ownerUserId: userId }, { name: 'Investment', ownerUserId: userId },
    { name: 'Fun', ownerUserId: userId }, { name: 'Luxuries', ownerUserId: userId }
  ]);
  const a = await db.list('accounts', { limit: 50, filter: { ownerUserId: userId } });
  if (!a.items.length) await db.add('accounts', [
    { name: 'M-Pesa', ownerUserId: userId }, { name: 'M-Shwari', ownerUserId: userId },
    { name: 'KCB Bank', ownerUserId: userId }, { name: 'Cash', ownerUserId: userId }
  ]);
  const p = await db.list('profile', { limit: 1, filter: { ownerUserId: userId } });
  if (!p.items.length) await db.add('profile', [{ xp: 0, unallocated: 0, ownerUserId: userId }]);
}
async function xp(uid: string, n: number) {
  const r = await db.list('profile', { limit: 1, filter: { ownerUserId: uid } });
  const p = r.items[0];
  if (p) await db.update('profile', [{ id: p.id, record: { ...p, xp: ((p as any).xp || 0) + n } }]);
}
async function profile(uid: string) {
  const r = await db.list('profile', { limit: 1, filter: { ownerUserId: uid } });
  return r.items[0];
}
function validFrequency(f: string) { return ['daily', 'weekly', 'monthly', 'yearly'].includes(f); }
function daysInMonth(y: number, m: number) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
function nextDueAt(c: Commitment, from = new Date()) {
  const d = new Date(from);
  if (c.frequency === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 5, 0, 0); return d.toISOString();
  }
  if (c.frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7); d.setUTCHours(0, 5, 0, 0); return d.toISOString();
  }
  const targetDay = Math.max(1, Math.min(31, Number(c.dueDay || 1)));
  if (c.frequency === 'yearly') {
    let year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    let target = new Date(Date.UTC(year, month, Math.min(targetDay, daysInMonth(year, month)), 0, 5, 0));
    if (target.getTime() <= from.getTime()) {
      year += 1; target = new Date(Date.UTC(year, month, Math.min(targetDay, daysInMonth(year, month)), 0, 5, 0));
    }
    return target.toISOString();
  }
  let year = d.getUTCFullYear(), month = d.getUTCMonth();
  let target = new Date(Date.UTC(year, month, Math.min(targetDay, daysInMonth(year, month)), 0, 5, 0));
  if (target.getTime() <= from.getTime()) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    target = new Date(Date.UTC(year, month, Math.min(targetDay, daysInMonth(year, month)), 0, 5, 0));
  }
  return target.toISOString();
}
function duePeriodKey(c: Commitment, due = new Date()) {
  if (c.frequency === 'daily') return due.toISOString().slice(0, 10);
  if (c.frequency === 'weekly') {
    const d = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
    const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1);
    return d.toISOString().slice(0, 10);
  }
  if (c.frequency === 'yearly') return String(due.getUTCFullYear());
  return due.toISOString().slice(0, 7);
}
async function ensureInstances(uid: string, commitments: Array<Commitment & { id: string }>) {
  const goals = await db.list<Goal>('goals', { limit: 100, filter: { ownerUserId: uid } });
  for (const c of commitments.filter(x => x.active)) {
    const key = duePeriodKey(c, new Date(c.nextDueAt || nextDueAt(c)));
    const exists = goals.items.some(g => g.commitmentId === c.id && g.periodKey === key);
    if (!exists) {
      await db.add('goals', [{
        name: c.name + ' · ' + key, target: c.amount, saved: 0, spent: 0,
        bucket: c.bucket, account: c.account || '', status: 'active', kind: c.kind,
        commitmentId: c.id, periodKey: key, periodStatus: 'pending', ownerUserId: uid
      }]);
    }
  }
}
async function migrateCommitments(uid: string, commitments: Array<Commitment & { id: string }>) {
  const goals = await db.list<Goal>('goals', { limit: 100, filter: { ownerUserId: uid } });
  for (const c of commitments) {
    if (c.fundingMigrated === true) continue;
    const linked = goals.items.filter(g => g.commitmentId === c.id);
    const oldAllocated = linked.reduce((s, g) => s + Number(g.saved || 0), 0);
    const balance = Number(c.balance || 0) + oldAllocated;
    const updated = { ...c, balance, nextDueAt: c.nextDueAt || nextDueAt(c), fundingMigrated: true };
    await db.update('commitments', [{ id: c.id, record: updated }]);
    if (oldAllocated > 0) {
      await db.update('goals', linked.map(g => ({ id: g.id, record: { ...g, saved: 0, periodStatus: 'migrated_to_commitment' } })));
      await db.add('events', [{ type: 'commitment_migration', commitmentId: c.id, amount: oldAllocated, reason: 'Existing recurring quest allocation moved to commitment balance', createdAt: new Date().toISOString(), ownerUserId: uid }]);
    }
  }
}
async function commitmentList(uid: string) {
  const r = await db.list<Commitment>('commitments', { limit: 100, filter: { ownerUserId: uid } });
  const items = r.items.map(c => ({ ...c, balance: Number(c.balance || 0), nextDueAt: c.nextDueAt || nextDueAt(c) }));
  return items;
}
async function getState(uid: string) {
  await defaults(uid);
  let commitments = await commitmentList(uid);
  await migrateCommitments(uid, commitments as Array<Commitment & { id: string }>);
  commitments = await commitmentList(uid);
  await ensureInstances(uid, commitments as Array<Commitment & { id: string }>);
  const [g, b, a, e, p, c] = await Promise.all([
    db.list<Goal>('goals', { limit: 100, filter: { ownerUserId: uid } }),
    db.list('buckets', { limit: 50, filter: { ownerUserId: uid } }),
    db.list('accounts', { limit: 50, filter: { ownerUserId: uid } }),
    db.list<Event>('events', { limit: 200, filter: { ownerUserId: uid } }),
    db.list('profile', { limit: 1, filter: { ownerUserId: uid } }),
    db.list<Commitment>('commitments', { limit: 100, filter: { ownerUserId: uid } })
  ]);
  const names = new Map(g.items.map(x => [x.id, x.name]));
  const events = e.items.map(x => ({ ...x, fromName: x.from ? names.get(x.from) : undefined, toName: x.to ? names.get(x.to) : undefined }));
  const completed = g.items.filter(x => x.status === 'completed' || x.status === 'archived').length;
  const contributions = events.filter(x => ['contribution', 'commitment_top_up'].includes(x.type)).length;
  const adjustments = events.filter(x => ['transfer', 'expense', 'withdrawal', 'spend', 'commitment_spend', 'commitment_deduction'].includes(x.type)).length;
  const goalAllocated = g.items.filter(x => !x.commitmentId).reduce((s, x) => s + Number(x.saved || 0), 0);
  const commitmentReserved = c.items.reduce((s, x) => s + Number((x as any).balance || 0), 0);
  const unallocated = Number((p.items[0] as any)?.unallocated || 0);
  return {
    goals: g.items, accounts: a.items, buckets: b.items, commitments: c.items.map(x => ({ ...x, balance: Number((x as any).balance || 0), nextDueAt: (x as any).nextDueAt || nextDueAt(x) })),
    events, unallocated, xp: (p.items[0] as any)?.xp || 0,
    stats: {
      integrity: 100, discipline: Math.min(100, completed * 12), consistency: Math.min(100, contributions * 5),
      balance: Math.min(100, 50 + b.items.filter((x: any) => g.items.some(y => y.bucket === x.name)).length * 10),
      power: Math.min(100, Math.round((goalAllocated + commitmentReserved + unallocated) / 1000)),
      adaptability: Math.min(100, adjustments * 10)
    },
    recurringHealth: {
      totalReserved: commitmentReserved,
      monthlyOutflow: c.items.reduce((s, x) => {
        const a = Number(x.amount || 0);
        return s + (x.frequency === 'daily' ? a * 30.4375 : x.frequency === 'weekly' ? a * 4.345 : x.frequency === 'yearly' ? a / 12 : a);
      }, 0),
      activeCount: c.items.filter(x => x.active).length
    }
  };
}
async function changeGoal(uid: string, id: string, delta: number) {
  const [g] = await db.get<Goal>('goals', [id]);
  if (!g || g.ownerUserId !== uid || g.saved + delta < 0) return false;
  return (await db.update('goals', [{ id, record: { ...g, saved: g.saved + delta } }]))[0];
}
async function getCommitment(uid: string, id: string) {
  const [c] = await db.get<Commitment>('commitments', [id]);
  return c && c.ownerUserId === uid ? c : null;
}
async function event(uid: string, record: Omit<Event, 'ownerUserId'>) {
  const [id] = await db.add('events', [{ ...record, ownerUserId: uid }]);
  return id;
}
async function deductCommitment(uid: string, c: Commitment & { id: string }, due: Date) {
  const goals = await db.list<Goal>('goals', { limit: 100, filter: { ownerUserId: uid } });
  const key = duePeriodKey(c, due);
  const instance = goals.items.find(g => g.commitmentId === c.id && g.periodKey === key);
  const prior = await db.list<Event>('events', { limit: 200, filter: { ownerUserId: uid } });
  const already = prior.items.some(e => e.type === 'commitment_deduction' && e.commitmentId === c.id && e.reason === 'period:' + key);
  if (already) return false;
  const dueAmount = Number(c.pendingAmount ?? c.amount);
  const balance = Number(c.balance || 0);
  const amount = Math.min(balance, dueAmount);
  const underfunded = amount < dueAmount;
  const next = { ...c, balance: balance - amount, nextDueAt: nextDueAt({ ...c, amount: c.pendingAmount ?? c.amount, frequency: c.pendingFrequency ?? c.frequency }, due), amount: c.pendingAmount ?? c.amount, frequency: c.pendingFrequency ?? c.frequency, pendingAmount: undefined, pendingFrequency: undefined };
  await db.update('commitments', [{ id: c.id, record: next }]);
  await event(uid, { type: 'commitment_deduction', amount, commitmentId: c.id, reason: 'period:' + key, createdAt: new Date().toISOString() });
  if (instance) {
    await db.update('goals', [{ id: instance.id, record: { ...instance, saved: 0, spent: amount, status: underfunded ? 'active' : 'completed', periodStatus: underfunded ? 'underfunded' : 'spent' } }]);
  }
  if (amount > 0) await xp(uid, underfunded ? 3 : 20);
  return true;
}
export const processCommitments = async (_event: { type: 'cron'; name: string; invocationId: string; scheduledTime: string }) => {
  const users = await db.list<Owned>('profile', { limit: 500 });
  for (const owner of users.items) {
    if (!owner.ownerUserId) continue;
    const commitments = await commitmentList(owner.ownerUserId);
    const now = new Date();
    for (const c of commitments.filter(x => x.active && x.nextDueAt && new Date(x.nextDueAt) <= now)) {
      await deductCommitment(owner.ownerUserId, c as Commitment & { id: string }, new Date(c.nextDueAt!));
    }
  }
  return { statusCode: 200 };
};
const P = (fn: any) => [requireAuth(), fn];

export const handler = router({
  'GET /api/state': P(async c => json(await getState(c.user!.userId))),
  'POST /api/money': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (n <= 0) return error('Enter a positive amount', 400);
    const p = await profile(u); if (!p) return error('Profile unavailable', 500);
    const updated = await db.update('profile', [{ id: p.id, record: { ...p, unallocated: Number((p as any).unallocated || 0) + n } }]);
    if (!updated[0]) return error('Could not add money', 500);
    const id = await event(u, { type: 'money_added', amount: n, location: x.location || '', createdAt: new Date().toISOString() });
    if (!id) return error('Money was added but its history event failed', 500);
    await xp(u, 2); return json({ ok: true });
  }),
  'POST /api/goals': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.target);
    if (!x.name || n <= 0 || !x.bucket) return error('Missing required quest fields', 400);
    const [id] = await db.add('goals', [{ name: x.name, target: n, saved: 0, spent: 0, bucket: x.bucket, account: x.account || '', deadline: x.deadline, status: 'active', kind: x.kind === 'expense' ? 'expense' : 'goal', ownerUserId: u }]);
    return id ? json({ id }) : error('Could not create quest', 500);
  }),
  'POST /api/goals/update': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const [g] = await db.get<Goal>('goals', [x.id]);
    if (!g || g.ownerUserId !== u || g.commitmentId || g.status === 'archived') return error('Quest cannot be edited', 400);
    if (!x.name || !x.bucket) return error('Quest name and bucket are required', 400);
    const record = { ...g, name: x.name, bucket: x.bucket, account: x.account || '', deadline: x.deadline || undefined, kind: x.kind === 'expense' ? 'expense' : 'goal' };
    await db.update('goals', [{ id: g.id, record }]);
    await event(u, { type: 'goal_updated', goalId: g.id, amount: 0, reason: 'Quest details updated', createdAt: new Date().toISOString() });
    return json({ ok: true });
  }),
  'POST /api/goals/adjust-target': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.target);
    const [g] = await db.get<Goal>('goals', [x.id]);
    if (!g || g.ownerUserId !== u || g.commitmentId || g.status === 'archived') return error('Quest cannot be adjusted', 400);
    if (n <= 0) return error('Target must be positive', 400);
    const excess = Math.max(0, Number(g.saved || 0) - n);
    if (excess > 0) {
      if (!x.releaseTo) return error(`The new target releases ${excess.toLocaleString()} from this quest. Choose where that money goes.`, 400);
      if (x.releaseTo === 'unallocated') {
        const p = await profile(u); if (!p) return error('Profile unavailable', 500);
        await db.update('profile', [{ id: p.id, record: { ...p, unallocated: Number((p as any).unallocated || 0) + excess } }]);
      } else {
        const [destination] = await db.get<Goal>('goals', [x.releaseTo]);
        if (!destination || destination.ownerUserId !== u || destination.commitmentId || destination.status === 'archived' || destination.id === g.id) return error('Choose a valid destination quest', 400);
        await changeGoal(u, destination.id!, excess);
        await event(u, { type: 'transfer', from: g.id, to: destination.id, amount: excess, reason: 'Excess released by target reduction', createdAt: new Date().toISOString() });
      }
    }
    await db.update('goals', [{ id: g.id, record: { ...g, target: n, saved: Number(g.saved || 0) - excess } }]);
    await event(u, { type: 'goal_target_change', goalId: g.id, amount: n, reason: `Target changed from ${g.target} to ${n}${excess ? `; ${excess} released` : ''}`, createdAt: new Date().toISOString() });
    return json({ ok: true });
  }),
  'POST /api/goals/archive': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const [g] = await db.get<Goal>('goals', [x.id]);
    if (!g || g.ownerUserId !== u || g.commitmentId || g.status === 'archived') return error('Quest cannot be archived', 400);
    const balance = Number(g.saved || 0);
    if (balance > 0) {
      if (!x.releaseTo) return error(`Reallocate the remaining ${balance.toLocaleString()} before archiving`, 400);
      if (x.releaseTo === 'unallocated') {
        const p = await profile(u); if (!p) return error('Profile unavailable', 500);
        await db.update('profile', [{ id: p.id, record: { ...p, unallocated: Number((p as any).unallocated || 0) + balance } }]);
      } else {
        const [destination] = await db.get<Goal>('goals', [x.releaseTo]);
        if (!destination || destination.ownerUserId !== u || destination.commitmentId || destination.status === 'archived' || destination.id === g.id) return error('Choose a valid destination quest', 400);
        await changeGoal(u, destination.id!, balance);
        await event(u, { type: 'transfer', from: g.id, to: destination.id, amount: balance, reason: 'Allocation moved before quest archive', createdAt: new Date().toISOString() });
      }
    }
    await db.update('goals', [{ id: g.id, record: { ...g, saved: 0, status: 'archived', archived: true } }]);
    await event(u, { type: 'goal_archive', goalId: g.id, amount: balance, createdAt: new Date().toISOString(), reason: balance ? 'Remaining allocation reallocated before archive' : 'Quest archived' });
    return json({ ok: true });
  }),
  'POST /api/contributions': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.goalId || n <= 0) return error('Invalid allocation', 400);
    const p = await profile(u); const available = Number((p as any)?.unallocated || 0);
    if (!p || n > available) return error('Not enough unallocated money', 400);
    const [g] = await db.get<Goal>('goals', [x.goalId]);
    if (!g || g.ownerUserId !== u || g.status === 'archived' || g.commitmentId) return error('Quest is not available for allocation', 400);
    await db.update('profile', [{ id: p.id, record: { ...p, unallocated: available - n } }]);
    if (!await changeGoal(u, x.goalId, n)) return error('Could not update quest', 500);
    const id = await event(u, { type: 'contribution', goalId: x.goalId, amount: n, createdAt: new Date().toISOString() });
    if (!id) return error('Allocation was not recorded', 500);
    await xp(u, 5); return json({ ok: true });
  }),
  'POST /api/commitments/topup': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.id || n <= 0) return error('Enter a positive top-up amount', 400);
    const cmt = await getCommitment(u, x.id); if (!cmt) return error('Commitment not found', 404);
    const p = await profile(u); const available = Number((p as any)?.unallocated || 0);
    if (!p || n > available) return error('Not enough unallocated money', 400);
    await db.update('profile', [{ id: p.id, record: { ...p, unallocated: available - n } }]);
    await db.update('commitments', [{ id: cmt.id, record: { ...cmt, balance: Number(cmt.balance || 0) + n } }]);
    const id = await event(u, { type: 'commitment_top_up', commitmentId: cmt.id, amount: n, createdAt: new Date().toISOString() });
    if (!id) return error('Top-up was not recorded', 500);
    await xp(u, 5); return json({ ok: true });
  }),
  'POST /api/commitments/spend': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.id || n <= 0) return error('Enter a valid spending amount', 400);
    const cmt = await getCommitment(u, x.id); if (!cmt || n > Number(cmt.balance || 0)) return error('Spending exceeds the reserved balance', 400);
    await db.update('commitments', [{ id: cmt.id, record: { ...cmt, balance: Number(cmt.balance || 0) - n } }]);
    const id = await event(u, { type: 'commitment_spend', commitmentId: cmt.id, amount: n, reason: x.reason || '', createdAt: new Date().toISOString() });
    if (!id) return error('Spending was not recorded', 500);
    await xp(u, 10); return json({ ok: true });
  }),
  'POST /api/commitments/rebalance': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.id || n <= 0) return error('Enter a valid amount', 400);
    const cmt = await getCommitment(u, x.id); if (!cmt || n > Number(cmt.balance || 0)) return error('Not enough commitment balance', 400);
    if (x.to === 'unallocated') {
      const p = await profile(u); if (!p) return error('Profile unavailable', 500);
      await db.update('commitments', [{ id: cmt.id, record: { ...cmt, balance: Number(cmt.balance || 0) - n } }]);
      await db.update('profile', [{ id: p.id, record: { ...p, unallocated: Number((p as any).unallocated || 0) + n } }]);
      const id = await event(u, { type: 'commitment_rebalance', commitmentId: cmt.id, amount: n, to: 'unallocated', reason: x.reason || '', createdAt: new Date().toISOString() });
      if (!id) return error('Rebalance was not recorded', 500);
      return json({ ok: true });
    }
    const target = await getCommitment(u, x.to);
    if (!target || target.id === cmt.id) return error('Choose another commitment', 400);
    await db.update('commitments', [
      { id: cmt.id, record: { ...cmt, balance: Number(cmt.balance || 0) - n } },
      { id: target.id, record: { ...target, balance: Number(target.balance || 0) + n } }
    ]);
    const id = await event(u, { type: 'commitment_rebalance', commitmentId: cmt.id, to: target.id, amount: n, reason: x.reason || '', createdAt: new Date().toISOString() });
    if (!id) return error('Rebalance was not recorded', 500);
    return json({ ok: true });
  }),
  'POST /api/commitments/toggle': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const cmt = await getCommitment(u, x.id);
    if (!cmt) return error('Commitment not found', 404);
    const active = Boolean(x.active);
    await db.update('commitments', [{ id: cmt.id, record: { ...cmt, active } }]);
    await event(u, { type: active ? 'commitment_resume' : 'commitment_pause', commitmentId: cmt.id, amount: 0, createdAt: new Date().toISOString() });
    return json({ ok: true });
  }),
  'POST /api/commitments/adjust': P(async c => {
    const x = c.body as any; const u = c.user!.userId;
    const cmt = await getCommitment(u, x.id); if (!cmt) return error('Commitment not found', 404);
    const record: any = { ...cmt };
    if (x.amount !== undefined && x.amount !== '') {
      const n = Number(x.amount); if (n <= 0) return error('Amount must be positive', 400);
      record.pendingAmount = n;
    }
    if (x.frequency !== undefined && x.frequency !== '') {
      if (!validFrequency(x.frequency)) return error('Invalid frequency', 400);
      record.pendingFrequency = x.frequency;
    }
    if (record.pendingAmount === undefined && record.pendingFrequency === undefined) return error('No change supplied', 400);
    await db.update('commitments', [{ id: cmt.id, record }]);
    if (x.amount !== undefined && x.amount !== '') await event(u, { type: 'commitment_amount_change', commitmentId: cmt.id, amount: Number(x.amount), reason: 'Effective next cycle', createdAt: new Date().toISOString() });
    if (x.frequency !== undefined && x.frequency !== '') await event(u, { type: 'commitment_frequency_change', commitmentId: cmt.id, amount: 0, reason: 'Effective next cycle', createdAt: new Date().toISOString() });
    return json({ ok: true });
  }),
  'POST /api/commitments/update': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const cmt = await getCommitment(u, x.id);
    if (!cmt || (cmt as any).archived) return error('Commitment cannot be edited', 400);
    if (!x.name || !x.bucket || !validFrequency(x.frequency)) return error('Name, bucket and frequency are required', 400);
    const record = { ...cmt, name: x.name, bucket: x.bucket, account: x.account || '', kind: x.kind === 'goal' ? 'goal' : 'expense' };
    await db.update('commitments', [{ id: cmt.id, record }]);
    await event(u, { type: 'commitment_updated', commitmentId: cmt.id, amount: 0, reason: 'Commitment details updated', createdAt: new Date().toISOString() });
    return json({ ok: true });
  }),
  'POST /api/commitments/archive': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const cmt = await getCommitment(u, x.id);
    if (!cmt) return error('Commitment not found', 404);
    if (Number(cmt.balance || 0) > 0) return error('Reallocate the remaining balance before archiving', 400);
    await db.update('commitments', [{ id: cmt.id, record: { ...cmt, active: false, archived: true } }]);
    await event(u, { type: 'commitment_archive', commitmentId: cmt.id, amount: 0, createdAt: new Date().toISOString() });
    return json({ ok: true });
  }),
  'POST /api/complete': P(async c => {
    const u = c.user!.userId; const [g] = await db.get<Goal>('goals', [(c.body as any).goalId]);
    if (!g || g.ownerUserId !== u || g.commitmentId || g.status !== 'active' || g.saved < g.target) return error('Quest is not ready to complete', 400);
    await db.update('goals', [{ id: g.id, record: { ...g, status: 'completed' } }]);
    await event(u, { type: 'completion', goalId: g.id, amount: g.target, createdAt: new Date().toISOString() }); await xp(u, 100); return json({ ok: true });
  }),
  'POST /api/spend': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.goalId || n <= 0) return error('Enter a valid spending amount', 400);
    const [g] = await db.get<Goal>('goals', [x.goalId]);
    if (!g || g.ownerUserId !== u || g.commitmentId || g.status === 'archived' || n > g.saved) return error('Spending exceeds the remaining allocation', 400);
    const remaining = g.saved - n; const spent = (g.spent || 0) + n; const status = remaining === 0 ? 'archived' : g.status;
    await db.update('goals', [{ id: g.id, record: { ...g, saved: remaining, spent, status } }]);
    const id = await event(u, { type: 'spend', goalId: g.id, amount: n, reason: x.reason || '', createdAt: new Date().toISOString() });
    if (!id) return error('Spending was not recorded', 500);
    await xp(u, 10); return json({ ok: true });
  }),
  'POST /api/rebalance': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.from || n <= 0) return error('Choose a source quest and positive amount', 400);
    if (!await changeGoal(u, x.from, -n)) return error('The source quest does not have enough allocation', 400);
    if (x.kind === 'transfer') {
      if (!x.to || x.to === x.from || !await changeGoal(u, x.to, n)) { await changeGoal(u, x.from, n); return error('Choose a different valid destination quest', 400); }
      const id = await event(u, { type: 'transfer', from: x.from, to: x.to, amount: n, reason: x.reason || '', createdAt: new Date().toISOString() });
      if (!id) return error('Transfer was not recorded', 500);
    } else {
      const id = await event(u, { type: x.kind === 'expense' ? 'expense' : 'withdrawal', goalId: x.from, amount: n, reason: x.reason || '', createdAt: new Date().toISOString() });
      if (!id) return error('Adjustment was not recorded', 500);
    }
    await xp(u, 10); return json({ ok: true });
  }),
  'POST /api/accounts': P(async c => { const x = c.body as any; if (!x.name) return error('Account name required', 400); const [id] = await db.add('accounts', [{ name: x.name, ownerUserId: c.user!.userId }]); return id ? json({ id }) : error('Could not add account', 500); }),
  'POST /api/buckets': P(async c => { const x = c.body as any; if (!x.name) return error('Bucket name required', 400); const [id] = await db.add('buckets', [{ name: x.name, ownerUserId: c.user!.userId }]); return id ? json({ id }) : error('Could not add bucket', 500); })
});
