# v1 simulation contract

This document fixes the step-1 design decisions for the [PRD](../PRD.md). All values are illustrative simulation inputs, **not measured CPU characteristics**. The website and any future CLI must call the same pure simulation module; no network service is required for v1.

## Units and input contract

Input is UTF-8 JSON with this shape (also available as [`examples/default.json`](../examples/default.json)):

```json
{
  "schemaVersion": 1,
  "jobs": [{"id": "A", "arrivalMs": 0, "work": 8}],
  "machine": {
    "states": [{"frequency": 0.5, "activeWatts": 1.5}, {"frequency": 1, "activeWatts": 3}],
    "idleWatts": 0.5,
    "switchMs": 0.2
  },
  "settings": {"quantumMs": 2, "weight": 0.5, "sweepWeights": [0, 0.25, 0.5, 0.75, 1]}
}
```

- `schemaVersion` is exactly `1`. Required keys are `jobs`, `machine`, `settings`, and all fields shown above except `sweepWeights`. Unknown keys are rejected to prevent silent typos. A workload import uses this complete format; the UI may edit its fields individually.
- `jobs` contains 1–200 entries in **input order**. IDs are unique, nonempty strings (max 40 characters); `arrivalMs` is finite and >= 0; `work` is finite and > `1e-9` reference-frequency ms (to stay above the completion tolerance). Work is CPU time at reference frequency 1.0, measured in reference-frequency milliseconds.
- `machine.states` contains 1–16 entries sorted by strictly increasing positive finite `frequency`; `activeWatts` must be positive finite and nondecreasing with frequency. `idleWatts` is finite and >= 0; `switchMs` is finite and >= 0. No requirement that idle power be lower than active power: the numbers are user-supplied assumptions.
- `settings.quantumMs` is finite and > `1e-9` (wall-clock ms); `weight` and optional `sweepWeights` contain finite values in [0, 1]. Sweep weights must be unique, ascending, and at most 21 entries. If absent, there is no sweep. The UI runs all three policies by default.
- Reject invalid JSON, missing fields, unknown fields, duplicate IDs, NaN/Infinity, and out-of-range values before simulation; identify paths such as `jobs[2].arrivalMs`. Reject empty workloads rather than inventing zero-job metrics. Guard against extremely long workloads at the UI level and run computation off the main UI thread if needed.
- Synthetic workload generation and seeded randomness are deferred from v1: deterministic hand-entered/imported workloads provide reproducibility. If later added, export the realized jobs and seed. No seed is accepted in the v1 schema.

## Deterministic event and queue rules

Use a single CPU and IEEE-754 double precision. Compare event times with absolute tolerance `1e-9` ms, clamp residual work <= `1e-9` to zero; never emit zero-duration segments. If two events are within tolerance, treat them as simultaneous at the earlier time. Sort by arrival time then input index (ID is unique but not a sorting key). Full-precision values are retained in JSON; display rounding does not affect calculations.

At time 0, enqueue arrived jobs. When nothing is ready, emit an idle interval to the next arrival. At a dispatch boundary, enqueue all arrivals up to that instant before selecting a job. A switch interval of `switchMs` is inserted only when dispatching a **different** job immediately after a run (not after idle, at first dispatch, or when the same job resumes). Jobs arriving during a switch join the ready queue, but do not replace the already selected next job. Charge `idleWatts` for both idle and switch intervals. The CPU never executes two jobs concurrently; execution cannot start before arrival. Frequencies change only at dispatch; no transition penalty.

- **FCFS:** choose earliest-arrived ready job, then run until completion, ignoring quantum. New arrivals join the queue.
- **Round Robin:** ready jobs form a FIFO queue; a job runs for at most `quantumMs` of wall-clock time or until completed. At a slice end, enqueue arrivals at or before the end (in arrival/input order) **before** re-enqueuing the unfinished running job. If the queue contains only that job, resume it without a switch. Arrivals during a slice are ordered by time and input index.
- **Power-aware:** use the identical Round Robin job rotation; only the frequency for the selected job changes. This isolates the effect of frequency decisions from job selection. No policy claims global optimality.
- FCFS/RR use the state closest to frequency 1.0, breaking equal-distance ties toward the lower frequency; report the actual chosen frequency. Finish the current job even if a new job arrives mid-slice. The horizon is the last completion time, starting at time 0 (including initial idle).

## Power-aware score (fixed for v1)

At each power-aware dispatch, let `t` be the time **after any switch**, `j` be the chosen job with remaining work `w`, `q` be `quantumMs`, and `N` be total job count. For each available frequency `f` with power `P(f)`:

- `d(f) = min(q, w/f)` is the prospective active slice duration.
- `E(f) = P(f) * d(f)` mJ estimates active energy for this slice. Idle/switch energy is independent of the candidate frequency at this boundary and is excluded from the score, but included in actual reported energy.
- `D(f) = sum(max(0, t + d(f) - max(t, arrivalMs[k])))` over every *other* job `k` that has not yet first started and whose arrival is <= `t + d(f)`. This estimates added first-response delay to waiting or arriving jobs; it deliberately does not predict later slices. Include future arrivals known from the input. The chosen job's first-start delay is identical for all frequencies and does not enter the score.
- Define `T = q / minFrequency`, `Escale = maxActiveWatts * T`, `Dscale = max(1, N-1) * T`. Both are strictly positive and depend only on configuration, not on results. `score(f) = weight * E(f)/Escale + (1-weight) * D(f)/Dscale`.

Select minimum score. For scores equal within `1e-12`, choose lower `E(f)`, then higher frequency. At weight 0, this minimizes *estimated incremental response delay*; when all delays tie it chooses lower slice energy, rather than claiming the fastest frequency always wins. At weight 1, it minimizes slice energy. Normalization only scales terms and does not change their dimensional meaning. This local heuristic does not minimize global energy or global mean response time, and includes no future idle-energy prediction.

## Output contract

One run emits the normalized input plus `units`, `results` (FCFS, RR, power-aware), and optional `sweep` (one power-aware result per requested weight). A result has `policy` (`fcfs`, `rr`, `powerAware`), `parameters` (actual baseline frequency, quantum, and/or weight as applicable), `horizonMs`, `jobs` (input ID/order, `arrivalMs`, `firstStartMs`, `completionMs`, `runMs`, `responseMs`, `turnaroundMs`, `waitingMs`), `timeline` and `metrics`. Each timeline segment is `{kind: "run"|"idle"|"switch", jobId: string|null, startMs, endMs, frequency: number|null, energyMj}`; only run segments have a job ID/frequency. Metrics include `meanResponseMs`, `maxResponseMs`, `meanTurnaroundMs`, `makespanMs`, `totalEnergyMj`, `activeEnergyMj`, `idleEnergyMj`, `switchEnergyMj`. Energy is watts × milliseconds = millijoules. Waiting time is turnaround minus actual run duration (and therefore includes time blocked by another job or by a switch). Total energy must equal the sum of segment energies and its three energy components within numerical tolerance. Export input and results with full numeric precision, not rounded display values.

In a sweep, a point is dominated when another tested point has <= both total energy and mean response, and < at least one (within a `1e-9` metric comparison tolerance). Equal points are both nondominated. Mark each point with `nondominated: boolean`; do not call this the global Pareto frontier.

## Illustrative fixtures

- **Balanced default:** [`examples/default.json`](../examples/default.json), with three staggered jobs and three frequency/power states. Use for the website's “Load example” action.
- **Latency-focused illustrative preset:** same workload, set weight to 0; **energy-focused:** same workload, weight 1. These are policy settings, not different hardware measurements.

## Hand-check cases for implementation

1. One job with arrival 2, work 4, state (1, 3 W), idle 0.5 W, switch 0: idle `[0,2)` = 1 mJ, run `[2,6)` = 12 mJ; response 0, horizon 6, total 13 mJ.
2. Two jobs arriving at 0 with work 2 each, RR quantum 1, state (1, 3 W), switch duration 0.2 and idle 0.5 W: first run A `[0,1)`, switch `[1,1.2)`, run B `[1.2,2.2)`; verify arrivals/rotation and that switch power is 0.1 mJ per switch. Continue until both complete.
3. One job with work 4, states (0.5, 2 W) and (1, 3 W): at 0.5 it takes 8 ms and 16 mJ; at 1 it takes 4 ms and 12 mJ. A lower frequency need not save energy.
