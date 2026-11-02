import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { referenceStateIndex, powerAwareStateIndex, runPolicy, runComparison, markNondominated } from '../src/policies.js';

const example = JSON.parse(readFileSync(new URL('../examples/default.json', import.meta.url), 'utf8'));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('baseline chooses nearest reference frequency, ties to lower', () => {
  assert.equal(referenceStateIndex([{ frequency: 0.5 }, { frequency: 1.5 }]), 0);
  assert.equal(referenceStateIndex(example.machine.states), 1);
  assert.equal(runPolicy(example, 'fcfs').parameters.frequency, 1);
});

test('FCFS completes first job before later arrivals; RR rotates at quantum', () => {
  const fcfs = runPolicy(example, 'fcfs');
  assert.deepEqual(fcfs.timeline.filter(x => x.kind === 'run').map(x => x.jobId), ['A', 'B', 'C']);
  const rr = runPolicy(example, 'rr');
  assert.deepEqual(rr.timeline.filter(x => x.kind === 'run').slice(0, 4).map(x => x.jobId), ['A', 'B', 'A', 'C']);
  close(fcfs.jobs[1].responseMs, 7.2);
  assert.equal(rr.parameters.quantumMs, 2);
});

test('power-aware score responds to future first-start delay vs energy', () => {
  const jobs = [
    Object.freeze({ id: 'A', arrivalMs: 0, remainingWork: 4, firstStartMs: null }),
    Object.freeze({ id: 'B', arrivalMs: 0.5, remainingWork: 2, firstStartMs: null }),
  ];
  const context = { timeMs: 0, job: jobs[0], jobs, states: [
    { frequency: 0.5, activeWatts: 1 }, { frequency: 2, activeWatts: 8 },
  ] };
  // With a 10 ms quantum, slow duration=8 and fast duration=2.
  assert.equal(powerAwareStateIndex(context, 10, 0), 1);
  assert.equal(powerAwareStateIndex(context, 10, 1), 0);
  assert.equal(powerAwareStateIndex({ ...context, jobs: [jobs[0]] }, 10, 0), 0);
});

test('power-aware job rotation matches RR while frequency can change', () => {
  const input = structuredClone(example);
  input.settings.weight = 1;
  const rr = runPolicy(input, 'rr'), power = runPolicy(input, 'powerAware');
  // First slice: energy-minimizing frequency 0.5; later scheduling may diverge due to timings.
  assert.equal(power.timeline.find(x => x.kind === 'run').frequency, 0.5);
  assert.equal(rr.timeline.find(x => x.kind === 'run').frequency, 1);
  assert.equal(power.timeline.find(x => x.kind === 'run').jobId, 'A');
  assert.equal(power.jobs.length, rr.jobs.length);
});

test('report is deterministic, serializable and contains sweep with comparison metrics', () => {
  const report = runComparison(example);
  assert.deepEqual(report, runComparison(example));
  assert.equal(report.sweep.length, 5);
  assert.deepEqual(Object.keys(report.results), ['fcfs', 'rr', 'powerAware']);
  assert.equal(report.units.energy, 'mJ');
  assert.doesNotThrow(() => JSON.stringify(report));
  for (const result of [...Object.values(report.results), ...report.sweep]) {
    close(result.metrics.totalEnergyMj, result.timeline.reduce((n, segment) => n + segment.energyMj, 0));
    assert.equal(result.jobs.length, example.jobs.length);
  }
});

test('frontier detects domination but preserves duplicate points', () => {
  const points = [[10, 5], [12, 6], [10, 5], [8, 8], [11, 4]].map(([totalEnergyMj, meanResponseMs]) =>
    ({ metrics: { totalEnergyMj, meanResponseMs } }));
  assert.deepEqual(markNondominated(points).map(x => x.nondominated), [true, false, true, true, true]);
});

test('invalid policy or weight is rejected', () => {
  assert.throws(() => runPolicy(example, 'unknown'), /policy/);
  assert.throws(() => runPolicy(example, 'powerAware', -0.1), /weight/);
});
