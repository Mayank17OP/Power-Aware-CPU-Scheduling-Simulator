import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { server } from '../server.js';

test('website serves app and backend calculates validated comparison', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/web/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SCHEDULE REPLAY/);
    const config = readFileSync(new URL('../examples/default.json', import.meta.url), 'utf8');
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: config };
    const response = await fetch(`${base}/api/simulate`, options);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(Object.keys(result.results), ['fcfs', 'rr', 'powerAware']);
    assert.equal(result.sweep.length, 5);
    const bad = await fetch(`${base}/api/simulate`, { ...options, body: '{"schemaVersion":1}' });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /jobs/);
    assert.equal((await fetch(`${base}/.git/HEAD`)).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
