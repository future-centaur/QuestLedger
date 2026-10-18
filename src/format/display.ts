import type { Commitment, Goal } from '../../shared/types';
import { formatMoney } from '../../shared/money';

/** `cents` is an integer number of cents. A whole shilling stays whole. */
export function money(cents: number): string {
  return formatMoney(cents);
}

export function dateText(v?: string): string {
  return v
    ? new Date(v).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
}

export function statusFor(c: Commitment): string {
  return !c.active
    ? 'Paused'
    : Number(c.balance || 0) >= Number(c.amount)
      ? 'Fully funded'
      : Number(c.balance || 0) > 0
        ? 'Partially funded'
        : 'Underfunded';
}

export function cyclesText(c: Commitment): string {
  const amount = Number(c.amount || 0),
    balance = Number(c.balance || 0);
  if (!amount) return '0 cycles';
  const full = Math.floor(balance / amount),
    remainder = balance % amount;
  return full
    ? `${full} full ${c.frequency}${full === 1 ? '' : 's'}${remainder ? ` + ${money(remainder)}` : ''}`
    : `0 full cycles + ${money(remainder)}`;
}

export function forwardEstimate(c: Commitment): number {
  return Number(c.pendingAmount ?? c.amount);
}

export function daysOfCover(c: Commitment): string {
  const estimate = forwardEstimate(c);
  const balance = Number(c.balance || 0);
  if (estimate <= 0 || balance <= 0) return 'Needs funding';
  const count = Math.round((balance / estimate) * 10) / 10;
  const unit =
    c.frequency === 'daily' ? 'day' : c.frequency === 'weekly' ? 'week' : c.frequency === 'monthly' ? 'month' : 'year';
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

export function runRate(periods: Pick<Goal, 'spent' | 'periodStatus'>[]): number | null {
  const closed = periods.filter(
    (p) => (p.periodStatus === 'spent' || p.periodStatus === 'underfunded') && Number(p.spent) > 0,
  );
  const recent = closed.slice(0, 7);
  if (!recent.length) return null;
  return recent.reduce((sum, p) => sum + Number(p.spent), 0) / recent.length;
}

export function postedEstimate(
  periodKey: string,
  events: { type: string; reason?: string; amount?: number }[],
): number | null {
  const reason = 'period:' + periodKey;
  if (events.some((e) => e.type === 'commitment_true_up' && e.reason === reason)) return null;
  const deduction = events.find(
    (e) => e.type === 'commitment_deduction' && e.reason === reason && Number(e.amount) > 0,
  );
  return deduction ? Number(deduction.amount) : null;
}

export function exhaustionText(c: Commitment): string {
  const amount = Number(c.amount || 0),
    balance = Number(c.balance || 0);
  if (!c.nextDueAt || amount <= 0 || balance <= 0) return 'Needs funding';
  const full = Math.floor(balance / amount);
  const d = new Date(c.nextDueAt);
  if (balance % amount === 0 && full > 0)
    d.setDate(
      d.getDate() +
        Math.max(0, full - 1) *
          (c.frequency === 'daily'
            ? 1
            : c.frequency === 'weekly'
              ? 7
              : c.frequency === 'monthly'
                ? 30
                : 365),
    );
  return dateText(d.toISOString());
}
