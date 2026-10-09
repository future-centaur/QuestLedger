import { frequencies } from '../../shared/config.js';
import type { Commitment, Frequency } from '../../shared/types';

export function validFrequency(f: string): f is Frequency {
  return (frequencies as readonly string[]).includes(f);
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

export function nextDueAt(c: Commitment, from = new Date()) {
  const d = new Date(from);
  if (c.frequency === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 5, 0, 0);
    return d.toISOString();
  }
  if (c.frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
    d.setUTCHours(0, 5, 0, 0);
    return d.toISOString();
  }
  const targetDay = Math.max(1, Math.min(31, Number(c.dueDay || 1)));
  if (c.frequency === 'yearly') {
    let year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    let target = new Date(Date.UTC(year, month, Math.min(targetDay, daysInMonth(year, month)), 0, 5, 0));
    if (target.getTime() <= from.getTime()) {
      year += 1;
      target = new Date(Date.UTC(year, month, Math.min(targetDay, daysInMonth(year, month)), 0, 5, 0));
    }
    return target.toISOString();
  }
  let year = d.getUTCFullYear(),
    month = d.getUTCMonth();
  let target = new Date(Date.UTC(year, month, Math.min(targetDay, daysInMonth(year, month)), 0, 5, 0));
  if (target.getTime() <= from.getTime()) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    target = new Date(Date.UTC(year, month, Math.min(targetDay, daysInMonth(year, month)), 0, 5, 0));
  }
  return target.toISOString();
}

/** Idempotency key for a commitment period. Stored verbatim; do not re-derive on import. */
export function duePeriodKey(c: Commitment, due = new Date()) {
  if (c.frequency === 'daily') return due.toISOString().slice(0, 10);
  if (c.frequency === 'weekly') {
    const d = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return d.toISOString().slice(0, 10);
  }
  if (c.frequency === 'yearly') return String(due.getUTCFullYear());
  return due.toISOString().slice(0, 7);
}
