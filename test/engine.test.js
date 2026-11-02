import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, validateInput } from '../src/engine.js';

const fixture = JSON.parse(readFileSync(new URL('../examples/default.json', import.meta.url), 'utf8'));
function input(jobs, states = [{ frequency: 1, activeWatts: 3 }], idleWatts = 0.5, switchMs = 0) {
  return { schemaVersion: 1, jobs, machine: { states, idleWatts, switchMs }, settings: { quantumMs: 1, weight: 0.5 } };
}
const run = (config, sliceMs = Infinity, chooseState = () => 0) => simulate(config, { sliceMs, chooseState });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('example conforms to schema and simulation never mutates input', () => {
  const before = JSON.stringify(fixture);
  assert.equal(validateInput(fixture), fixture);
  assert.equal(run(fixture).jobs.length, 3);
  assert.equal(JSON.stringify(fixture), before);
  assert.deepEqual(run(fixture), run(fixture));
});

test('initial idle, completion, response and interval energy', () => {
  const result = run(input([{ id: 'A', arrivalMs: 2, work: 4 }]));
  assert.deepEqual(result.timeline.map(({ kind, startMs, endMs, energyMj }) => [kind, startMs, endMs, energyMj]),
    [['idle', 0, 2, 1], ['run', 2, 6, 12]]);
  assert.equal(result.metrics.totalEnergyMj, 13);
  assert.equal(result.horizonMs, 6);
  assert.equal(result.jobs[0].responseMs, 0);
});

test('RR queue order, switch intervals and boundary arrivals', () => {
  const result = run(input([
    { id: 'A', arrivalMs: 0, work: 2 },
    { id: 'B', arrivalMs: 0, work: 2 },
    { id: 'C', arrivalMs: 1, work: 1 },
  ], undefined, 0.5, 0.2), 1);
  assert.deepEqual(result.timeline.filter(x => x.kind === 'run').map(x => x.jobId), ['A', 'B', 'C', 'A', 'B']);
  close(result.timeline[1].energyMj, 0.1);
  close(result.jobs[1].responseMs, 1.2);
  close(result.metrics.totalEnergyMj, result.timeline.reduce((n, x) => n + x.energyMj, 0));
  for (let i = 1; i < result.timeline.length; i++) close(result.timeline[i - 1].endMs, result.timeline[i].startMs);
  for (const job of result.jobs) close(job.runMs, input([
    { id: 'A', arrivalMs: 0, work: 2 }, { id: 'B', arrivalMs: 0, work: 2 }, { id: 'C', arrivalMs: 1, work: 1 },
  ]).jobs.find(x => x.id === job.id).work);
});

test('arrival during switch cannot displace selected job; idle resets switch', () => {
  const result = run(input([
    { id: 'A', arrivalMs: 0, work: 1 },
    { id: 'B', arrivalMs: 0, work: 1 },
    { id: 'C', arrivalMs: 1.2, work: 1 },
    { id: 'D', arrivalMs: 10, work: 1 },
  ], undefined, 0.5, 0.5));
  assert.deepEqual(result.timeline.filter(x => x.kind === 'run').map(x => x.jobId), ['A', 'B', 'C', 'D']);
  assert.equal(result.timeline.at(-2).kind, 'idle');
});

test('slower frequency can use more active energy', () => {
  const config = input([{ id: 'A', arrivalMs: 0, work: 4 }], [
    { frequency: 0.5, activeWatts: 2 }, { frequency: 1, activeWatts: 3 },
  ]);
  close(run(config, Infinity, () => 0).metrics.totalEnergyMj, 16);
  close(run(config, Infinity, () => 1).metrics.totalEnergyMj, 12);
});

test('bad fields, unknown keys and invalid policy callback fail explicitly', () => {
  for (const [change, path] of [
    [x => { x.jobs[0].arrivalMs = -1; }, 'jobs[0].arrivalMs'],
    [x => { x.jobs[1].id = 'A'; }, 'jobs[1].id'],
    [x => { x.machine.states[0].frequency = 0; }, 'machine.states[0].frequency'],
    [x => { x.settings.weight = NaN; }, 'settings.weight'],
    [x => { x.machine.extra = 1; }, 'machine.extra'],
  ]) {
    const config = structuredClone(fixture);
    change(config);
    assert.throws(() => validateInput(config), { message: new RegExp(path.replaceAll('[', '\\[').replaceAll(']', '\\]')) });
  }
  assert.throws(() => run(fixture, 1, () => 20), /chooseState/);
});
