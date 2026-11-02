/** Deterministic, single-CPU simulation core. No policy or browser dependencies. */
export const EPSILON = 1e-9;

function fail(path, message) { throw new TypeError(`${path}: ${message}`); }
function keys(value, required, optional, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'required');
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`${path}.${key}`, 'unknown field');
}
function numeric(value, path, minimum, strict = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (strict ? value <= minimum : value < minimum))
    fail(path, `expected finite number ${strict ? '>' : '>='} ${minimum}`);
}

/** Validate without mutating input. Throws TypeError with a field path. */
export function validateInput(input) {
  keys(input, ['schemaVersion', 'jobs', 'machine', 'settings'], [], 'input');
  if (input.schemaVersion !== 1) fail('schemaVersion', 'expected 1');
  if (!Array.isArray(input.jobs) || input.jobs.length < 1 || input.jobs.length > 200) fail('jobs', 'expected 1–200 jobs');
  const ids = new Set();
  input.jobs.forEach((job, i) => {
    const path = `jobs[${i}]`;
    keys(job, ['id', 'arrivalMs', 'work'], [], path);
    if (typeof job.id !== 'string' || !job.id.trim() || job.id.length > 40) fail(`${path}.id`, 'expected nonempty string up to 40 characters');
    if (ids.has(job.id)) fail(`${path}.id`, 'duplicate ID');
    ids.add(job.id);
    numeric(job.arrivalMs, `${path}.arrivalMs`, 0);
    numeric(job.work, `${path}.work`, EPSILON, true);
  });
  keys(input.machine, ['states', 'idleWatts', 'switchMs'], [], 'machine');
  const { states } = input.machine;
  if (!Array.isArray(states) || states.length < 1 || states.length > 16) fail('machine.states', 'expected 1–16 states');
  states.forEach((state, i) => {
    const path = `machine.states[${i}]`;
    keys(state, ['frequency', 'activeWatts'], [], path);
    numeric(state.frequency, `${path}.frequency`, 0, true);
    numeric(state.activeWatts, `${path}.activeWatts`, 0, true);
    if (i && state.frequency <= states[i - 1].frequency) fail(`${path}.frequency`, 'must increase strictly');
    if (i && state.activeWatts < states[i - 1].activeWatts) fail(`${path}.activeWatts`, 'must be nondecreasing');
  });
  numeric(input.machine.idleWatts, 'machine.idleWatts', 0);
  numeric(input.machine.switchMs, 'machine.switchMs', 0);
  keys(input.settings, ['quantumMs', 'weight'], ['sweepWeights'], 'settings');
  numeric(input.settings.quantumMs, 'settings.quantumMs', EPSILON, true);
  numeric(input.settings.weight, 'settings.weight', 0);
  if (input.settings.weight > 1) fail('settings.weight', 'must be <= 1');
  if (input.settings.sweepWeights !== undefined) {
    const weights = input.settings.sweepWeights;
    if (!Array.isArray(weights) || weights.length > 21) fail('settings.sweepWeights', 'expected at most 21 weights');
    weights.forEach((weight, i) => {
      const path = `settings.sweepWeights[${i}]`;
      numeric(weight, path, 0);
      if (weight > 1 || (i && weight <= weights[i - 1])) fail(path, 'must be <= 1 and strictly increasing');
    });
  }
  return input;
}

/**
 * Run a FIFO ready-queue scheduler with policy-supplied frequency and time slice.
 * chooseState({timeMs, job, jobs, states}) returns an index in machine.states.
 * jobs is a read-only-by-convention snapshot of {id, arrivalMs, remainingWork, firstStartMs}.
 * No callbacks may mutate the input or snapshot. FCFS can use sliceMs=Infinity;
 * RR can use settings.quantumMs. Policy wrappers belong in step 3.
 */
export function simulate(input, { sliceMs, chooseState } = {}) {
  validateInput(input);
  if (!(sliceMs === Infinity || (typeof sliceMs === 'number' && Number.isFinite(sliceMs) && sliceMs > EPSILON)))
    fail('sliceMs', 'expected > 1e-9 or Infinity');
  if (typeof chooseState !== 'function') fail('chooseState', 'expected function');

  const { machine } = input;
  const jobs = input.jobs.map((job) => ({ ...job, remainingWork: job.work, firstStartMs: null, completionMs: null, runMs: 0 }));
  const arrivals = jobs.map((_, i) => i).sort((a, b) => jobs[a].arrivalMs - jobs[b].arrivalMs || a - b);
  let nextArrival = 0, completed = 0, time = 0, previous = null;
  const queue = [], timeline = [];
  function enqueue(through) {
    while (nextArrival < arrivals.length && jobs[arrivals[nextArrival]].arrivalMs <= through + EPSILON)
      queue.push(arrivals[nextArrival++]);
  }
  function segment(kind, jobId, end, frequency, power) {
    if (end <= time) return;
    timeline.push({ kind, jobId, startMs: time, endMs: end, frequency, energyMj: (end - time) * power });
    time = end;
  }

  while (completed < jobs.length) {
    enqueue(time);
    if (!queue.length) {
      const next = jobs[arrivals[nextArrival]].arrivalMs;
      segment('idle', null, next, null, machine.idleWatts);
      previous = null;
      continue;
    }
    const index = queue.shift();
    if (previous !== null && previous !== index)
      segment('switch', null, time + machine.switchMs, null, machine.idleWatts);
    enqueue(time); // arrivals during a switch cannot replace the selected job
    const job = jobs[index];
    const snapshot = jobs.map(({ id, arrivalMs, remainingWork, firstStartMs }) =>
      Object.freeze({ id, arrivalMs, remainingWork, firstStartMs }));
    const stateIndex = chooseState(Object.freeze({ timeMs: time, job: snapshot[index], jobs: Object.freeze(snapshot), states: machine.states }));
    if (!Number.isInteger(stateIndex) || stateIndex < 0 || stateIndex >= machine.states.length)
      fail('chooseState', 'returned invalid state index');
    const { frequency, activeWatts } = machine.states[stateIndex];
    const duration = Math.min(sliceMs, job.remainingWork / frequency);
    if (!(duration > 0) || time + duration === time) fail('simulation', 'time cannot advance; reduce magnitude of inputs');
    if (job.firstStartMs === null) job.firstStartMs = time;
    segment('run', job.id, time + duration, frequency, activeWatts);
    job.runMs += duration;
    job.remainingWork -= duration * frequency;
    if (job.remainingWork <= EPSILON) {
      job.remainingWork = 0;
      job.completionMs = time;
      completed++;
    }
    enqueue(time); // boundary arrivals precede the unfinished job
    if (job.remainingWork > 0) queue.push(index);
    previous = index;
  }
  const finished = jobs.map(({ id, arrivalMs, firstStartMs, completionMs, runMs }) => ({
    id, arrivalMs, firstStartMs, completionMs, runMs,
    responseMs: firstStartMs - arrivalMs,
    turnaroundMs: completionMs - arrivalMs,
    waitingMs: completionMs - arrivalMs - runMs,
  }));
  const energy = (kind) => timeline.filter((event) => event.kind === kind).reduce((sum, event) => sum + event.energyMj, 0);
  const activeEnergyMj = energy('run'), idleEnergyMj = energy('idle'), switchEnergyMj = energy('switch');
  return {
    horizonMs: time,
    jobs: finished,
    timeline,
    metrics: {
      meanResponseMs: finished.reduce((sum, job) => sum + job.responseMs, 0) / finished.length,
      maxResponseMs: Math.max(...finished.map((job) => job.responseMs)),
      meanTurnaroundMs: finished.reduce((sum, job) => sum + job.turnaroundMs, 0) / finished.length,
      makespanMs: time,
      totalEnergyMj: activeEnergyMj + idleEnergyMj + switchEnergyMj,
      activeEnergyMj, idleEnergyMj, switchEnergyMj,
    },
  };
}
