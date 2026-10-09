/**
 * Amounts are still JavaScript numbers (float64). That matches what is
 * deployed today. It is not the long-term representation: integer minor units
 * or a decimal type belong at the database boundary, and this module is the
 * place that change lands.
 *
 * Every amount that arrives from outside the process goes through
 * `parsePositive`. `Number(x) <= 0` does not reject `NaN` (`NaN <= 0` is
 * false), which previously let a non-numeric amount write `NaN` into a
 * balance and break conservation for that user.
 */
export function parsePositive(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
