# Website UX blueprint (v1)

## Audience, route, and user journey

Single-page website at `/`, no login or backend required. New visitors see a short explanation of the energy/response trade-off, a populated example workload, and a prominent **Run comparison** button. They can edit jobs and machine settings, import a complete JSON input, run all policies, inspect results, adjust weight/sweep, and download a full-precision JSON report. Reset/Load example restores the bundled fixture. Keep edits local in page state; do not imply they have been saved remotely.

## Desktop wireframe (wide viewport)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Power-Aware CPU Scheduling Simulator           About model / Help  │
│ Compare response time and energy; simulated estimates, not watts  │
├──────────────────────────────┬───────────────────────────────────────┤
│ 1  Workload                  │ 2  Machine & policy                   │
│ ID   Arrival (ms)   Work     │ frequency   active power (W)          │
│ A       0             8      │ 0.5         1.5                       │
│ B       1             3      │ 1.0         3.0                       │
│ [Add job] [Import JSON]      │ idle W, switch ms, quantum ms         │
│                              │ energy weight 0 ──●──── 1            │
│                              │ [Run comparison] [Load example]       │
├──────────────────────────────┴───────────────────────────────────────┤
│ 3  Results: policy comparison table + metric summary                 │
│ FCFS | Round Robin | Power-aware  [Download JSON]                    │
│ Gantt timeline (scrollable, labeled; matching event table below)    │
│ Energy vs mean response plot (weight sweep) + accessible point table│
│ Job details, assumptions and units                                    │
└──────────────────────────────────────────────────────────────────────┘
```

On screens narrower than ~768 px, stack workload, machine/policy, and results vertically; keep **Run comparison** after all editable settings. Use horizontally scrollable tables/timelines with visible scroll cues; never compress labels into illegible text. Charts and controls must remain usable at 320 px viewport width. No results appear until a run is requested; after edits, label prior results **Out of date** until rerun.

## Component and interaction checklist

- **Header:** product name, one-sentence explanation, link/accordion for model assumptions and units.
- **Workload editor:** rows with ID, arrival (ms), work (reference-frequency ms), add/remove buttons; prevent removing last row or show a clear validation error. Provide Load example and Import JSON (file picker), with parse/schema errors linked to the affected field. Preserve edits when validation fails.
- **Machine editor:** ordered frequency/power rows, add/remove; idle power and switch time inputs. Numeric labels include units and constraints; do not silently coerce empty input to zero.
- **Policy settings:** RR quantum, energy weight slider **and** synchronized numeric input (0–1), optional sweep toggle showing the editable sweep weights. Explain that 0 favors estimated response delay and 1 favors active slice energy, not guaranteed global optima.
- **Action area:** Run comparison button, inline validation, progress indicator if calculation takes perceptible time; disable duplicate runs. If processing blocks UI for larger inputs, use a Web Worker.
- **Results:** side-by-side table of energy (mJ), mean/max response (ms), turnaround (ms), makespan (ms); clearly indicate direction “lower is better” per metric rather than a single winner. Policy tabs or selector for a labeled Gantt timeline with zoom/scroll and a corresponding accessible event table. Detailed per-job table includes start, completion, response, turnaround and waiting times. Sweep plot has labeled axes and an equivalent point table with nondominated markers; chart colors never convey meaning alone. JSON download exports input and all results.
- **States:** initial (example prefilled, no computed results), invalid input (field-specific errors and focus summary), calculating, success, and calculation failure (nontechnical message plus retry). No misleading success state when settings have changed since last run.

## Accessibility and visual direction

Use semantic headings, labeled form controls, keyboard-accessible buttons/tabs, visible focus rings and polite status announcements for run state. Errors are text, associated with inputs and summarized above the form; do not rely on color alone. Make results tables navigable with table headers. Provide text-equivalent event and sweep tables for both charts. Aim for WCAG 2.2 AA color contrast; respect reduced-motion preferences. Visual style: neutral background, restrained blue for actions, distinct accessible policy colors, generous spacing and monospace numerals for aligned metrics. Avoid decorative animation in a scientific tool.

## Out of scope for this step

These are designs and contracts, not a running website or engine. Build the engine in step 2, policies in step 3, editor in step 4, and results visualization in step 5. Hosting choice is deferred to step 6.
