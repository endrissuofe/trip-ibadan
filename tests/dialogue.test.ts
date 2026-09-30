import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dialogue } from '../src/systems/Dialogue.ts';
import { LINES } from '../src/data/dialogue.ts';

test('dialogue fills tokens and never repeats a line back-to-back', () => {
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const d = new Dialogue(LINES, r);
  let prev = '';
  for (let i = 0; i < 200; i++) {
    const s = d.say('destination', { dest: 'Mowe' });
    assert.ok(s.includes('Mowe'));
    assert.ok(!s.includes('{'));
    assert.notEqual(s, prev);
    prev = s;
  }
});

test('every intent has at least two lines so dialogue can vary', () => {
  for (const [k, v] of Object.entries(LINES)) assert.ok(v.length >= 2, k);
});
