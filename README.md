# Power-Aware CPU Scheduling Simulator

A responsive website for exploring the trade-off between simulated CPU energy use and response time. The deterministic simulation engine and three scheduling policies are implemented; a simple website input editor and comparison summary are now available. The website includes timelines, per-job results, a sweep chart and JSON export.

## Project documents

- [Product requirements and six-step delivery plan](PRD.md)
- [Step 1: simulation contract and scheduling rules](docs/SPEC.md)
- [Step 1: website UX blueprint](docs/UX.md)
- [Step 1: example workload and machine profile](examples/default.json)

## Step 2: simulation engine

Run `npm test` (Node.js 20+). `src/engine.js` exports `validateInput(input)` and `simulate(input, { sliceMs, chooseState })`. The engine accepts the v1 JSON input, tracks FIFO arrivals and execution intervals, and reports per-job timings and energy metrics. Supply `sliceMs` (wall-clock milliseconds or `Infinity`) and a `chooseState({timeMs, job, jobs, states})` callback returning an index into `machine.states`. This callback runs after any context switch; policy implementations live in step 3.

## Step 3: policies and comparison

`src/policies.js` exports `runPolicy(input, policy, weight?)` for `fcfs`, `rr`, or `powerAware`, plus `runComparison(input)` to obtain all three results and an optional weight sweep with nondominated markers. It also exports `referenceStateIndex`, `powerAwareStateIndex`, and `markNondominated` for focused tests. The scoring formula and limitations are documented in [the simulation contract](docs/SPEC.md). All results are serializable JSON with full-precision numbers.



## Step 4: website input editor

From the repository root, run `npm start` (Node.js 20+) and open `http://localhost:8000/` (the root opens the app). The Node server serves the site and runs the simulation behind `POST /api/simulate`. A static file server alone will not calculate results. Edit jobs, CPU power states, energy weight (slider or numeric field), and optional sweep weights. Load the bundled example or import a valid v1 JSON file, then select **Run comparison**. Invalid fields are identified in the form. The summary shows energy and response-time metrics. The server uses the same `src/` modules covered by the unit tests. The browser sends input to the API and receives calculated results.

## Step 5: results and export

After running a comparison, use the policy selector to inspect its execution timeline, event table, job timings and energy breakdown. Enable **Compare several weights** to see a scatter plot and matching table of tested power-aware weights. **Download JSON** exports the complete input and full-precision results (display values are rounded). The chart is supplementary: its table provides the same values and nondominated status.

Next: integration/accessibility testing, documentation and deployment (step 6).

## Animated schedule playback

After calculation, choose a policy and press **Play schedule** to replay its completed timeline. The CPU indicator, active segment, job label and simulated clock change during playback. Pause, seek, or reset at any time. This animation replays calculated simulation results; it does **not** monitor a physical CPU or stream an in-progress calculation. The loading indicator appears only while the browser awaits the backend response.

## Deploy on Vercel

1. Import this GitHub repository into Vercel and select the branch you want deployed.
2. Choose **Other** as the framework preset, leave Root Directory as the repository root, and leave Build Command and Output Directory unset (no build step). Use Node.js 22.x.
3. Deploy. The root URL redirects to `/web/` so relative CSS, JavaScript and example URLs load correctly. The `/api/simulate` route is a Vercel Node.js Function using the same simulator as `npm start`. No API keys or environment variables are needed.
4. Open the deployment, confirm the example results load, edit a job, and press **Run comparison**. A working deployment returns JSON from `POST /api/simulate`.

Local development still uses `npm start`; the separate Vercel function exists only for serverless hosting. `npm test` covers both entry points. This repository configures Vercel deployment but does not automatically create a Vercel project or deployment.

## Hosted on GitHub Pages

The public site is [Power-Aware CPU Scheduling Simulator](https://mayank17op.github.io/Power-Aware-CPU-Scheduling-Simulator/). GitHub Pages has no server runtime, so its version runs the same scheduling engine **in your browser**; its calculation indicator says so. The local Node and Vercel versions still use the `/api/simulate` backend. Relative URLs and `.nojekyll` keep JavaScript modules, example data and styles working under the repository subpath.
