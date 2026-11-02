import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/simulate.js';

function call(method, body) {
  const response = {
    headers: {}, code: 200,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; return this; },
  };
  handler({ method, body }, response);
  return response;
}

test('Vercel API computes all policies with parsed JSON', () => {
  const input = JSON.parse(readFileSync(new URL('../examples/default.json', import.meta.url), 'utf8'));
  const result = call('POST', input);
  assert.equal(result.code, 200);
  assert.deepEqual(Object.keys(result.body.results), ['fcfs', 'rr', 'powerAware']);
  assert.equal(result.body.sweep.length, 5);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('Vercel API rejects wrong method, invalid input and oversized bodies', () => {
  assert.equal(call('GET').code, 405);
  assert.equal(call('POST', '{').body.error, 'Invalid JSON input.');
  assert.match(call('POST', { bad: true }).body.error, /schemaVersion/);
  assert.equal(call('POST', 'x'.repeat(256001)).code, 413);
});

test('Vercel routes root to app and preserves relative asset URLs', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.redirects.map(route => route.source), ['/', '/web']);
  assert.ok(config.redirects.every(route => route.destination === '/web/'));
  assert.deepEqual(config.rewrites, [{ source: '/web/', destination: '/web/index.html' }]);
});
