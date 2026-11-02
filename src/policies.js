/** Scheduling policies and comparison runner; shared by future browser UI. */
import { simulate, validateInput } from './engine.js';

export function referenceStateIndex(states) {
  let best = 0;
  for (let i = 1; i < states.length; i++) {
    // States are sorted ascending: equal distance deliberately keeps the lower frequency.
    if (Math.abs(states[i].frequency - 1) < Math.abs(states[best].frequency - 1)) best = i;
  }
  return best;
}

/** Local frequency decision prescribed by docs/SPEC.md; called after any switch. */
export function powerAwareStateIndex({ timeMs, job, jobs, states }, quantumMs, weight) {
  const minFrequency = states[0].frequency;
  const maxWatts = states.at(-1).activeWatts;
  const scaleTime = quantumMs / minFrequency;
  const scaleEnergy = maxWatts * scaleTime;
  const scaleDelay = Math.max(1, jobs.length - 1) * scaleTime;
  let best = null;
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    const duration = Math.min(quantumMs, job.remainingWork / state.frequency);
    const energy = state.activeWatts * duration;
    const end = timeMs + duration;
    let delay = 0;
    for (const other of jobs) {
      if (other === job || other.firstStartMs !== null || other.arrivalMs > end) continue;
      delay += Math.max(0, end - Math.max(timeMs, other.arrivalMs));
    }
    const score = weight * energy / scaleEnergy + (1 - weight) * delay / scaleDelay;
    if (!best || score < best.score - 1e-12 ||
      (Math.abs(score - best.score) <= 1e-12 && (energy < best.energy - 1e-12 ||
        (Math.abs(energy - best.energy) <= 1e-12 && state.frequency > states[best.index].frequency)))) {
      best = { index: i, score, energy };
    }
  }
  return best.index;
}

export function runPolicy(input, policy, weight = input.settings.weight) {
  validateInput(input);
  if (!['fcfs', 'rr', 'powerAware'].includes(policy)) throw new TypeError(`policy: unknown policy ${policy}`);
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1)
    throw new TypeError('weight: expected finite number in [0, 1]');
  const { quantumMs } = input.settings;
  const baselineIndex = referenceStateIndex(input.machine.states);
  const choice = policy === 'powerAware'
    ? (context) => powerAwareStateIndex(context, quantumMs, weight)
    : () => baselineIndex;
  const result = simulate(input, { sliceMs: policy === 'fcfs' ? Infinity : quantumMs, chooseState: choice });
  const parameters = policy === 'fcfs' ? { frequency: input.machine.states[baselineIndex].frequency }
    : policy === 'rr' ? { frequency: input.machine.states[baselineIndex].frequency, quantumMs }
      : { quantumMs, weight };
  return { policy, parameters, ...result };
}

const TOL = 1e-9;
export function markNondominated(points) {
  return points.map((point, index) => {
    const { totalEnergyMj: energy, meanResponseMs: response } = point.metrics;
    const dominated = points.some((other, j) => {
      if (j === index) return false;
      const e = other.metrics.totalEnergyMj, r = other.metrics.meanResponseMs;
      return e <= energy + TOL && r <= response + TOL &&
        (e < energy - TOL || r < response - TOL);
    });
    return { ...point, nondominated: !dominated };
  });
}

/** Full-precision, serializable report: one input, three policies, optional sweep. */
export function runComparison(input) {
  validateInput(input);
  const report = {
    input: structuredClone(input),
    units: { time: 'ms', work: 'reference-frequency ms', power: 'W', energy: 'mJ' },
    results: {
      fcfs: runPolicy(input, 'fcfs'),
      rr: runPolicy(input, 'rr'),
      powerAware: runPolicy(input, 'powerAware'),
    },
  };
  if (input.settings.sweepWeights !== undefined)
    report.sweep = markNondominated(input.settings.sweepWeights.map((weight) => runPolicy(input, 'powerAware', weight)));
  return report;
}
