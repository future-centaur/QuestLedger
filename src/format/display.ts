import type { Commitment } from '../../shared/types';
import { currency } from '../../shared/config';

export function money(n: number): string {
  return `${currency.symbol} ${Math.round(n).toLocaleString(currency.locale)}`;
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
    remainder = Math.round(balance % amount);
  return full
    ? `${full} full ${c.frequency}${full === 1 ? '' : 's'}${remainder ? ` + ${money(remainder)}` : ''}`
    : `0 full cycles + ${money(remainder)}`;
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
