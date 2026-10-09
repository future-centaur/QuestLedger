import type { LedgerStore } from './store';
import { query } from './db/client.js';
import { transaction } from './db/client.js';

type Kind = 'text' | 'num' | 'bool' | 'int' | 'time' | 'id';

const columns: Record<string, Record<string, { column: string; kind: Kind }>> = {
  profile: {
    id: { column: 'id', kind: 'id' },
    ownerUserId: { column: 'owner_user_id', kind: 'id' },
    xp: { column: 'xp', kind: 'num' },
    unallocated: { column: 'unallocated', kind: 'num' },
  },
  accounts: {
    id: { column: 'id', kind: 'id' },
    ownerUserId: { column: 'owner_user_id', kind: 'id' },
    name: { column: 'name', kind: 'text' },
  },
  buckets: {
    id: { column: 'id', kind: 'id' },
    ownerUserId: { column: 'owner_user_id', kind: 'id' },
    name: { column: 'name', kind: 'text' },
  },
  goals: {
    id: { column: 'id', kind: 'id' },
    ownerUserId: { column: 'owner_user_id', kind: 'id' },
    name: { column: 'name', kind: 'text' },
    target: { column: 'target', kind: 'num' },
    saved: { column: 'saved', kind: 'num' },
    spent: { column: 'spent', kind: 'num' },
    bucket: { column: 'bucket', kind: 'text' },
    account: { column: 'account', kind: 'text' },
    deadline: { column: 'deadline', kind: 'text' },
    status: { column: 'status', kind: 'text' },
    kind: { column: 'kind', kind: 'text' },
    commitmentId: { column: 'commitment_id', kind: 'id' },
    periodKey: { column: 'period_key', kind: 'text' },
    periodStatus: { column: 'period_status', kind: 'text' },
    archived: { column: 'archived', kind: 'bool' },
  },
  commitments: {
    id: { column: 'id', kind: 'id' },
    ownerUserId: { column: 'owner_user_id', kind: 'id' },
    name: { column: 'name', kind: 'text' },
    amount: { column: 'amount', kind: 'num' },
    frequency: { column: 'frequency', kind: 'text' },
    dueDay: { column: 'due_day', kind: 'int' },
    kind: { column: 'kind', kind: 'text' },
    bucket: { column: 'bucket', kind: 'text' },
    account: { column: 'account', kind: 'text' },
    active: { column: 'active', kind: 'bool' },
    balance: { column: 'balance', kind: 'num' },
    nextDueAt: { column: 'next_due_at', kind: 'time' },
    pendingAmount: { column: 'pending_amount', kind: 'num' },
    pendingFrequency: { column: 'pending_frequency', kind: 'text' },
    fundingMigrated: { column: 'funding_migrated', kind: 'bool' },
    archived: { column: 'archived', kind: 'bool' },
  },
  events: {
    id: { column: 'id', kind: 'id' },
    ownerUserId: { column: 'owner_user_id', kind: 'id' },
    type: { column: 'type', kind: 'text' },
    amount: { column: 'amount', kind: 'num' },
    from: { column: 'from_ref', kind: 'text' },
    to: { column: 'to_ref', kind: 'text' },
    goalId: { column: 'goal_id', kind: 'id' },
    commitmentId: { column: 'commitment_id', kind: 'id' },
    createdAt: { column: 'created_at', kind: 'time' },
    reason: { column: 'reason', kind: 'text' },
    location: { column: 'location', kind: 'text' },
  },
};

function tableOf(name: string) {
  const table = columns[name];
  if (!table) throw new Error(`Unknown table ${name}`);
  return table;
}

function quote(identifier: string): string {
  if (!/^[a-z_]+$/.test(identifier)) throw new Error(`Bad identifier ${identifier}`);
  return identifier;
}

function fromDb(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const spec = tableOf(table);
  const out: Record<string, unknown> = {};
  for (const [key, meta] of Object.entries(spec)) {
    const raw = row[meta.column];
    if (raw === undefined || raw === null) {
      if (meta.kind === 'bool' || meta.kind === 'text' || meta.kind === 'id' || meta.kind === 'time') out[key] = raw ?? undefined;
      else out[key] = raw;
      continue;
    }
    if (meta.kind === 'num' || meta.kind === 'int') out[key] = Number(raw);
    else if (meta.kind === 'time') out[key] = raw instanceof Date ? raw.toISOString() : String(raw);
    else out[key] = raw;
  }
  return out;
}

function toDb(kind: Kind, value: unknown): unknown {
  if (value === undefined) return null;
  if (kind === 'time' && value instanceof Date) return value.toISOString();
  return value;
}

function pairs(table: string, record: Record<string, unknown>, includeUndefined: boolean) {
  const spec = tableOf(table);
  const entries = Object.entries(record).filter(([key, value]) => {
    if (!spec[key] || key === 'id') return false;
    return includeUndefined || value !== undefined;
  });
  return entries.map(([key, value]) => ({
    column: spec[key].column,
    value: toDb(spec[key].kind, value),
    kind: spec[key].kind,
  }));
}

function cast(kind: Kind): string {
  if (kind === 'id') return '::uuid';
  if (kind === 'time') return '::timestamptz';
  return '';
}

export const neonStore: LedgerStore = {
  transaction,
  async list(table: string, opts?: { limit?: number; filter?: Record<string, any> }) {
    const spec = tableOf(table);
    const params: unknown[] = [];
    const where = Object.entries(opts?.filter || {}).map(([key, value]) => {
      const meta = spec[key];
      if (!meta) throw new Error(`Cannot filter ${table}.${key}`);
      params.push(value);
      return `${quote(meta.column)} = $${params.length}${cast(meta.kind)}`;
    });
    const sql = `SELECT * FROM ${quote(table)}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
    const rows = await query<Record<string, unknown>>(sql, params);
    return { items: rows.map((row) => fromDb(table, row)) as any[] };
  },
  async get(table: string, ids: string[]) {
    tableOf(table);
    if (!ids.length) return [];
    const rows = await query<Record<string, unknown>>(`SELECT * FROM ${quote(table)} WHERE id = ANY($1::uuid[])`, [ids]);
    const byId = new Map(rows.map((row) => [String(row.id), fromDb(table, row)]));
    return ids.map((id) => byId.get(id)).filter((row) => row !== undefined) as any[];
  },
  async add(table, records) {
    const ids: string[] = [];
    for (const record of records) {
      const fields = pairs(table, record, false);
      const names = ['id', ...fields.map((field) => quote(field.column))];
      const values = [`COALESCE($1::uuid, gen_random_uuid())`, ...fields.map((field, index) => `$${index + 2}${cast(field.kind)}`)];
      const params = [record.id ?? null, ...fields.map((field) => field.value)];
      const rows = await query<{ id: string }>(
        `INSERT INTO ${quote(table)} (${names.join(', ')}) VALUES (${values.join(', ')}) RETURNING id`,
        params,
      );
      ids.push(rows[0].id);
    }
    return ids;
  },
  async update(table, records) {
    const updated = [];
    for (const { id, record } of records) {
      const fields = pairs(table, record, true);
      if (!fields.length) continue;
      const assignments = fields.map((field, index) => `${quote(field.column)} = $${index + 1}${cast(field.kind)}`);
      const params = [...fields.map((field) => field.value), id];
      const rows = await query<Record<string, unknown>>(
        `UPDATE ${quote(table)} SET ${assignments.join(', ')} WHERE id = $${params.length}::uuid RETURNING *`,
        params,
      );
      if (rows[0]) updated.push(fromDb(table, rows[0]));
    }
    return updated;
  },
};
