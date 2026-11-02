# Product Requirements Document: Power-Aware CPU Scheduling Simulator

**Status:** Draft  
**Date:** 2026-11-02  
**Project:** Power-Aware CPU Scheduling Simulator

## 1. Overview

Build a reproducible simulator for comparing CPU scheduling policies on two competing goals: energy consumption and response time. Users should be able to supply a workload, run conventional baselines and a tunable power-aware policy under the same simulated conditions, and inspect the resulting trade-off. This is a simulation and educational/experimental tool, not an operating-system scheduler or a real hardware power meter.

## 2. Problem and goals

Conventional scheduling examples often optimize latency or throughput while ignoring CPU energy. Conversely, slowing the CPU to save energy can make interactive jobs wait longer. The simulator should expose this tension rather than claim one policy is universally best.

**Primary goals**
- Compare policies on identical, deterministic workloads and hardware assumptions.
- Provide a tunable policy that trades energy against response time.
- Show per-job timelines and aggregate metrics so the trade-off is explainable.
- Make model assumptions explicit and allow users to reproduce results.

**Non-goals for the first release**
- Kernel integration, real CPU frequency control, or hardware-calibrated energy estimates.
- Multi-core scheduling, thermal constraints, I/O blocking, deadlines, or preemption overhead beyond a configurable context-switch cost.
- Guarantees of optimal scheduling on arbitrary workloads.

## 3. Users and use cases

- **Student/educator:** compare FCFS, Round Robin and a power-aware policy on a small workload and understand why their metrics differ.
- **Researcher/developer:** sweep policy weights and frequency levels using a fixed seed and export comparable results.

Core flow: open the website → edit or load jobs and machine settings → select policies and trade-off weight → run simulation → review timeline, metrics and assumptions → export results.

## 4. Scope and functional requirements

### 4.1 Workload and configuration
- Accept jobs with a unique ID, arrival time, and CPU work (positive work units at reference frequency); optionally accept a priority for future extensions, but do not let it affect v1 policies.
- Accept a machine profile with allowed positive normalized CPU frequencies, active power for each frequency, idle power, and a nonnegative context-switch duration. Document all units (time in simulated milliseconds, power in watts, energy in millijoules; work in reference-frequency milliseconds).
- Accept a positive Round Robin quantum and a power-aware trade-off weight in `[0, 1]`. Supply a small built-in example and support loading a workload from JSON; reject duplicate IDs, invalid numeric values, empty frequency lists, and non-monotonic/nonpositive frequencies or power values with actionable errors.
- Defer synthetic workload generation to a later release; v1 uses deterministic edited or imported workloads shared by all compared policies.

### 4.2 Simulation engine
- Model one CPU with discrete events (arrivals, slice completion, job completion, and context switches). At normalized frequency `f`, a job with remaining work `w` takes `w/f` simulated milliseconds when uninterrupted. A frequency change takes effect at a dispatch boundary; no separate frequency-transition cost in v1.
- Track active, idle and context-switch intervals. Charge idle power during idle intervals and context-switch intervals (unless a separate switch power is explicitly configured in a later version). Stop accounting when the last job completes; report the simulation horizon so energy comparisons have a clear boundary.
- Deterministically break ties using arrival time then input order/job ID, and define arrivals at a slice boundary before choosing the next dispatch. Ensure jobs cannot execute before arrival, cannot run simultaneously, and complete exactly once.
- Include **FCFS** (non-preemptive, fixed reference frequency) and **Round Robin** (preemptive at quantum boundaries, fixed reference frequency) as baselines. If the configured frequencies do not contain `1.0`, use the nearest frequency and report it.
- Include a **power-aware policy** that selects a ready job and allowed frequency at dispatch boundaries. Use Round Robin eligibility/rotation and score candidate frequencies using normalized active-slice energy and incremental first-response delay; minimize `weight × normalized energy + (1 - weight) × normalized delay`, with deterministic tie-breaking. The exact formula and normalization are fixed in [the simulation contract](docs/SPEC.md). At weight `0`, prefer lower predicted delay; at weight `1`, prefer lower predicted slice energy. Do not label the policy globally optimal.

### 4.3 Results and interface
- Provide a responsive, accessible web application for v1. The website is the primary interface; a CLI is optional. Keep simulation logic separate from the UI so both can use the same engine.
- Provide a guided input form with editable jobs, machine frequencies and power settings, policy selection, quantum and trade-off weight. Show defaults, units, inline validation and a one-click example workload.
- Show loading, empty and error states; make forms keyboard-operable and label controls and chart data clearly. On mobile, allow result tables and timelines to scroll without hiding key metrics.
- Visualize execution as a labeled Gantt-style timeline and show side-by-side metric cards/table plus an energy-versus-response-time plot for weight sweeps. Provide a textual/table alternative to charts.
- Display/export a chronological execution timeline (job ID, start/end, frequency, and idle/switch segments), per-job arrival/start/completion times, and summary metrics by policy.
- Define **response time** as first CPU start minus arrival (not completion minus arrival); also report turnaround time (completion minus arrival) and waiting time (turnaround minus actual CPU running time). Report mean and maximum response time, mean turnaround, makespan, total energy, and the active/idle/switch energy breakdown. For an empty workload, either reject it clearly or return a documented zero-result consistently.
- Export machine-readable JSON containing input settings, policy name/parameters, metrics, and timeline. Show a human-readable results table on the website. Values should retain sufficient precision for meaningful comparisons.
- Compare policies side by side and support a weight sweep across multiple power-aware runs to show a simple energy-versus-response-time frontier; identify nondominated runs without implying optimality over untested policies.

## 5. Model assumptions and trade-off semantics

Power is piecewise constant for each frequency. Energy for any interval is `power (W) × duration (ms)` in mJ. Work and time may be fractional; use a documented floating-point tolerance for completion and tie comparisons. The workload and machine profile are inputs, not measurements of a physical processor. Low frequency is not automatically assumed to save *total* energy: leakage/idle energy and longer runtimes can reverse that relationship. Switching policies may change both the schedule and the horizon. Report raw metrics alongside any normalized score so users can evaluate the actual trade-off.

## 6. Acceptance criteria

1. A user can open the website, run the bundled example with one click, and obtain results for FCFS, Round Robin and the power-aware policy.
2. Repeating a run with identical inputs produces identical JSON results, including event order and metric values.
3. A test workload with staggered arrivals and a Round Robin quantum produces valid non-overlapping slices, correct first-start response times, and exact work conservation within the documented tolerance.
4. Unit tests independently verify energy calculations for active, idle and context-switch intervals, including a case where a slower frequency uses more total energy.
5. Invalid input is rejected before running, with an inline message identifying the offending field; malformed imported JSON also produces a clear error.
6. Every exported result identifies policy settings, frequency choices, simulation horizon, power assumptions and metric units; summary energy equals the sum of interval energy within tolerance.
7. The website displays a documented sweep with energy and response-time values for each tested weight and marks nondominated points; no claim of universal optimality is made.
8. The website supports keyboard navigation, readable labels and mobile layouts; the timeline and plot have a textual/table alternative. Users can download results as JSON.

## 7. Delivery plan (six steps)

1. **Specification and UX:** finalize JSON schema, scheduling tie rules, score normalization and sample power profiles; sketch the website flow and responsive layouts.
2. **Simulation engine:** build deterministic single-CPU event processing, interval timeline and energy accounting; verify against hand-calculated fixtures.
3. **Scheduling policies:** implement FCFS, Round Robin and the power-aware policy on the same engine, with unit tests for fairness and edge cases.
4. **Website inputs:** build the responsive job/machine editor, presets, policy controls and validation; connect it to the simulator without duplicating simulation logic.
5. **Website results:** add Gantt timeline, metric comparisons, sweep/frontier chart, accessible data tables and JSON download.
6. **Verification and release:** add integration and accessibility checks, verify deterministic exports and mobile behavior, document setup/model limitations, and deploy the website.

**Step 1 deliverables:** [simulation contract and example profile](docs/SPEC.md), [website UX blueprint](docs/UX.md), and [default JSON input](examples/default.json). The v1 trade-off is weighted rather than constrained by a response-time bound. Deployment target is selected in step 6.
