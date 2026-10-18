import assert from 'node:assert/strict';
import { test } from 'node:test';
import { money } from '../src/format/display.ts';
import { centsToDecimal, decimalToCents, formatMoney, parseCents } from './money.ts';

test('parseCents accepts a whole shilling, one decimal, and two decimals', () => {
  assert.equal(parseCents('10'), 1000);
  assert.equal(parseCents('10.4'), 1040);
  assert.equal(parseCents('10.40'), 1040);
  assert.equal(parseCents(10.4), 1040);
});

test('parseCents rejects a third decimal, zero, and non-numeric input', () => {
  assert.equal(parseCents('10.405'), null);
  assert.equal(parseCents(10.405), null);
  assert.equal(parseCents('0'), null);
  assert.equal(parseCents(''), null);
  assert.equal(parseCents('-1'), null);
  assert.equal(parseCents('abc'), null);
  assert.equal(parseCents(Number.NaN), null);
});

test('decimals round-trip through cents', () => {
  assert.equal(centsToDecimal(1040), '10.40');
  assert.equal(decimalToCents('10.40'), 1040);
  assert.equal(decimalToCents('10.400'), 1040);
  assert.equal(decimalToCents('-1.50'), -150);
});

test('a whole shilling stays whole and a cent is shown', () => {
  assert.equal(formatMoney(1000), money(1000));
  assert.equal(formatMoney(1040), money(1040));
  assert.equal(formatMoney(1000).includes('.'), false);
  assert.match(formatMoney(1040), /\.40$/);
});
