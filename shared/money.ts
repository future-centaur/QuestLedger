import { currency } from './config.js';

/**
 * Money is an integer number of cents. 100 cents is one shilling.
 * `numeric(14,2)` already stores that exact decimal. This module is the
 * only place that turns an entered amount or a database decimal into cents.
 *
 * A cent that was typed is the cent that is stored. Values with a third
 * decimal place are rejected, so nothing is rounded onto a nearby cent.
 */

/** 12 digits before the decimal, which is the limit of `numeric(14,2)`. */
const MAX_CENTS = 9_999_999_999_999_99;

/**
 * A positive amount from outside the process, in cents.
 * Strings are read digit by digit. A JSON number is accepted only when it
 * already sits on a cent.
 */
export function parseCents(value: unknown): number | null {
  if (typeof value === 'number') return centsFromNumber(value);
  if (typeof value === 'string') return centsFromText(value);
  return null;
}

function centsFromNumber(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const scaled = value * 100;
  const cents = Math.round(scaled);
  if (Math.abs(scaled - cents) > 1e-6) return null;
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

function centsFromText(raw: string): number | null {
  const text = raw.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = match[1];
  if (whole.length > 12) return null;
  const frac = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(whole) * 100 + Number(frac);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}

/** Decimal string for `numeric(14,2)`, from integer cents. */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Money is not integer cents: ${cents}`);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const shillings = Math.trunc(abs / 100);
  const rem = abs % 100;
  return `${negative ? '-' : ''}${shillings}.${String(rem).padStart(2, '0')}`;
}

/** Integer cents from a `numeric` value. Trailing zeros past two places are allowed. */
export function decimalToCents(raw: string): number {
  const text = raw.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Money is not a decimal: ${raw}`);
  const frac = match[3] ?? '';
  if (frac.length > 2 && /[^0]/.test(frac.slice(2))) {
    throw new Error(`Money has more than two decimal places: ${raw}`);
  }
  const cents = Number(match[2]) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) throw new Error(`Money is out of range: ${raw}`);
  return match[1] === '-' ? -cents : cents;
}

/** Whole shillings stay whole. Any remainder shows two digits, never rounded away. */
export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const shillings = Math.trunc(abs / 100);
  const rem = abs % 100;
  const grouped = shillings.toLocaleString(currency.locale);
  const body = rem === 0 ? grouped : `${grouped}.${String(rem).padStart(2, '0')}`;
  return `${currency.symbol} ${negative ? '-' : ''}${body}`;
}
