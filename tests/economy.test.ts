// Run: npm test   (Node 22.6+; uses Node's built-in test runner, no extra packages)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Float, notesFor, tenderFor, rollDispute, Ledger, DISPUTE_MIN_GAP } from '../src/systems/Economy.ts';

const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('notesFor breaks amounts into Naira notes', () => {
  assert.deepEqual(notesFor(2000), [1000, 1000]);
  assert.deepEqual(notesFor(1850), [1000, 500, 200, 100, 50]);
  assert.deepEqual(notesFor(0), []);
});

test('tender always covers the fare and is made of real notes', () => {
  const r = seeded(9);
  for (let i = 0; i < 2000; i++) {
    const fare = 300 + Math.floor(r() * 60) * 50;
    const t = tenderFor(fare, r);
    assert.ok(t.amount >= fare);
    assert.equal(t.notes.reduce((a, b) => a + b, 0), t.amount);
  }
});

test('spec example: fare 1,200, pays 2,000, change 800', () => {
  const f = new Float({ 500: 1, 200: 2, 100: 3, 50: 0, 1000: 0 });
  const change = f.makeChange(2000 - 1200)!;
  assert.equal(change.reduce((a, b) => a + b, 0), 800);
  f.take(change);
  assert.equal(f.total, 500 + 400 + 300 - 800);
});

test('makeChange returns null when exact change is impossible', () => {
  const f = new Float({ 500: 1, 1000: 0, 200: 0, 100: 0, 50: 0 });
  assert.equal(f.makeChange(300), null);
  const up = f.roundUpChange(300)!;
  assert.equal(up.paid, 500);
});

test('makeChange backtracks instead of failing greedily', () => {
  // 600 from {500×1, 200×3}: greedy takes 500 then is stuck; answer is 200×3
  const f = new Float({ 500: 1, 200: 3, 1000: 0, 100: 0, 50: 0 });
  assert.deepEqual(f.makeChange(600), [200, 200, 200]);
});

test('float grows with tenders', () => {
  const f = new Float({ 1000: 0, 500: 0, 200: 0, 100: 0, 50: 0 });
  f.add([1000, 500]);
  assert.equal(f.total, 1500);
  assert.throws(() => f.take([200]));
});

test('disputes are occasional and never back-to-back', () => {
  const r = seeded(4);
  let n = 0, since = DISPUTE_MIN_GAP;
  for (let i = 0; i < 10000; i++) {
    const d = rollDispute(r, since, 800);
    if (d) { n++; assert.ok(since >= DISPUTE_MIN_GAP); since = 0; } else since++;
  }
  const rate = n / 10000;
  assert.ok(rate > 0.02 && rate < 0.1, `dispute rate ${rate}`);
  assert.equal(rollDispute(() => 0, 10, 0), null, 'no change due → no dispute');
});

test('ledger net takings', () => {
  const l = new Ledger();
  l.faresCollected = 5000; l.refunds = 600; l.changeLoss = 100;
  assert.equal(l.net, 4300);
});
