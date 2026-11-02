import { setPlayback } from './playback.js';
import { runComparison } from '../src/policies.js';
import { renderPolicy, renderSweep } from './results.js';

const $ = (id) => document.getElementById(id);
const fields = ['idleWatts', 'switchMs', 'quantumMs', 'weight'];
let example;
let dirty = false;
let latestReport = null;

function row(type, values) {
  const tr = document.createElement('tr');
  const labels = type === 'job' ? ['ID', 'Arrival (ms)', 'Work (ms)'] : ['Frequency', 'Power (W)'];
  const keys = type === 'job' ? ['id', 'arrivalMs', 'work'] : ['frequency', 'activeWatts'];
  keys.forEach((key, index) => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.setAttribute('aria-label', `${labels[index]} for ${type} row`);
    input.dataset.key = key;
    input.type = key === 'id' ? 'text' : 'number';
    if (input.type === 'number') { input.step = 'any'; input.min = key === 'arrivalMs' ? '0' : '0.000000001'; }
    input.value = values[key] ?? '';
    td.append(input); tr.append(td);
  });
  const td = document.createElement('td');
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×';
  remove.setAttribute('aria-label', `Remove ${type} row`);
  remove.addEventListener('click', () => { tr.remove(); markDirty(); });
  td.append(remove); tr.append(td);
  return tr;
}
function fill(config) {
  $('job-rows').replaceChildren(...config.jobs.map(x => row('job', x)));
  $('state-rows').replaceChildren(...config.machine.states.map(x => row('state', x)));
  for (const key of fields) $(key).value = config.machine[key] ?? config.settings[key];
  $('weight-slider').value = config.settings.weight;
  $('sweep-enabled').checked = config.settings.sweepWeights !== undefined;
  $('sweepWeights').value = config.settings.sweepWeights?.join(', ') ?? '';
  $('sweep-field').hidden = !$('sweep-enabled').checked;
  document.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  $('errors').hidden = true;
  $('results').hidden = true;
  setPlayback(null);
  latestReport = null;
  dirty = false;
  $('status').textContent = 'Edit the example, then run a comparison.';
}
function markDirty() {
  if (!$('results').hidden) $('status').textContent = 'Results are out of date. Run again to update them.';
  dirty = true;
}
function number(value) { return value.trim() === '' ? NaN : Number(value); }
function extractRows(id) {
  return [...$(id).querySelectorAll('tr')].map(tr => Object.fromEntries(
    [...tr.querySelectorAll('input')].map(input => [input.dataset.key, input.type === 'number' ? number(input.value) : input.value.trim()])
  ));
}
function collect() {
  const sweep = $('sweep-enabled').checked;
  const weights = $('sweepWeights').value.trim();
  const sweepWeights = sweep ? (weights ? weights.split(',').map(value => number(value)) : []) : undefined;
  return {
    schemaVersion: 1,
    jobs: extractRows('job-rows'),
    machine: { states: extractRows('state-rows'), idleWatts: number($('idleWatts').value), switchMs: number($('switchMs').value) },
    settings: { quantumMs: number($('quantumMs').value), weight: number($('weight').value), ...(sweep ? { sweepWeights } : {}) },
  };
}
function showError(error) {
  $('errors').hidden = false;
  $('errors').textContent = error.message;
  $('status').textContent = 'Check the highlighted input and try again.';
  const path = error.message.split(':')[0];
  const field = { 'machine.idleWatts': 'idleWatts', 'machine.switchMs': 'switchMs', 'settings.quantumMs': 'quantumMs', 'settings.weight': 'weight', 'settings.sweepWeights': 'sweepWeights' }[path];
  let input = field ? $(field) : null;
  const match = path.match(/^(jobs|machine\.states)\[(\d+)\]\.(\w+)$/);
  if (path.startsWith('settings.sweepWeights[')) input = $('sweepWeights');
  if (match) input = $(match[1] === 'jobs' ? 'job-rows' : 'state-rows').querySelectorAll('tr')[Number(match[2])]?.querySelector(`[data-key="${match[3]}"]`);
  if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'errors'); input.focus(); }
  else $('errors').scrollIntoView({ block: 'center' });
}
function showResults(report) {
  const names = { fcfs: 'FCFS', rr: 'Round Robin', powerAware: 'Power-aware' };
  const format = n => Number(n.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  $('result-rows').replaceChildren(...Object.entries(report.results).map(([key, result]) => {
    const tr = document.createElement('tr');
    [names[key], result.metrics.totalEnergyMj, result.metrics.meanResponseMs,
      result.metrics.maxResponseMs, result.metrics.makespanMs].forEach((value, index) => {
      const td = document.createElement('td'); td.textContent = index ? format(value) : value; tr.append(td);
    });
    return tr;
  }));
  const entries = Object.entries(report.results);
  const leastEnergy = entries.reduce((best, current) => current[1].metrics.totalEnergyMj < best[1].metrics.totalEnergyMj ? current : best);
  const fastestResponse = entries.reduce((best, current) => current[1].metrics.meanResponseMs < best[1].metrics.meanResponseMs ? current : best);
  $('result-insight').textContent = leastEnergy[0] === fastestResponse[0]
    ? `${names[leastEnergy[0]]} has both the lowest energy and shortest mean response for this workload.`
    : `${names[leastEnergy[0]]} uses the least energy; ${names[fastestResponse[0]]} has the shortest mean response. Change the energy weight to explore the trade-off.`;
  latestReport = report;
  $('policy-view').value = 'fcfs';
  renderPolicy(report, 'fcfs');
  setPlayback(report.results.fcfs);
  renderSweep(report.sweep);
  $('results').hidden = false;
  dirty = false;
  $('status').textContent = 'Comparison complete. Results are simulated estimates.';
}
async function calculate(input) {
  const button = $('run-button');
  button.disabled = true;
  $('backend-progress').hidden = false;
  const onPages = location.hostname.endsWith('.github.io');
  $('calculation-heading').textContent = onPages ? 'Calculating in your browser' : 'Calculating on the server';
  $('calculation-detail').textContent = onPages
    ? 'Checking jobs · building schedules · measuring energy locally'
    : 'Checking jobs · building schedules · measuring energy';
  $('status').textContent = onPages ? 'Calculating locally in your browser…' : 'Sending the workload to the server for calculation…';
  try {
    if (onPages) {
      // GitHub Pages hosts static files only. Run the exact same pure simulator locally.
      await new Promise(resolve => setTimeout(resolve, 0));
      showResults(runComparison(input));
      $('status').textContent = 'Comparison complete in your browser. Results are simulated estimates.';
      return true;
    }
    const response = await fetch('/api/simulate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Calculation failed. Try again.');
    showResults(data);
    return true;
  } finally {
    button.disabled = false;
    $('backend-progress').hidden = true;
  }
}
$('sim-form').addEventListener('submit', async event => {
  event.preventDefault();
  document.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  $('errors').hidden = true;
  try { if (await calculate(collect())) $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (error) { showError(error); }
});
$('sim-form').addEventListener('input', event => {
  event.target.removeAttribute('aria-invalid');
  markDirty();
});
$('weight-slider').addEventListener('input', () => { $('weight').value = $('weight-slider').value; markDirty(); });
$('weight').addEventListener('input', () => {
  const value = Number($('weight').value);
  if ($('weight').value !== '' && value >= 0 && value <= 1) $('weight-slider').value = value;
});
$('sweep-enabled').addEventListener('change', () => { $('sweep-field').hidden = !$('sweep-enabled').checked; markDirty(); });
$('add-job').addEventListener('click', () => { if ($('job-rows').children.length < 200) { $('job-rows').append(row('job', { id: '', arrivalMs: 0, work: 1 })); markDirty(); } });
$('add-state').addEventListener('click', () => { if ($('state-rows').children.length < 16) { $('state-rows').append(row('state', { frequency: '', activeWatts: '' })); markDirty(); } });
$('reset').addEventListener('click', () => fill(example));
$('policy-view').addEventListener('change', () => { if (latestReport) { renderPolicy(latestReport, $('policy-view').value); setPlayback(latestReport.results[$('policy-view').value]); } });
$('download').addEventListener('click', () => {
  if (!latestReport) return;
  const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'cpu-scheduling-results.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('import').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const { validateInput } = await import('../src/engine.js');
    validateInput(data);
    fill(data);
    $('status').textContent = 'JSON imported. Run a comparison to see results.';
  } catch (error) { showError(error instanceof SyntaxError ? new Error('Import JSON: invalid JSON file') : error); }
  event.target.value = '';
});
try {
  example = await (await fetch('../examples/default.json')).json();
  fill(example);
  await calculate(example);
  $('status').textContent = 'Example results are ready below. Edit the settings and run again to compare your own workload.';
} catch (error) { showError(new Error('Could not load the example. Please refresh the page.')); }
