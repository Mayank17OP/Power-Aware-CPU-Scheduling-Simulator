/** DOM-only results renderer. All text derives from validated numeric results. */
const $ = id => document.getElementById(id);
export const format = n => Number(n.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
function cells(row, values) {
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.append(cell);
  }
  return row;
}
function table(id, rows) {
  $(id).replaceChildren(...rows.map(values => cells(document.createElement('tr'), values)));
}
function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.textContent = text;
  return node;
}
export function renderPolicy(report, policy) {
  const result = report.results[policy];
  if (!result) return;
  const horizon = result.horizonMs;
  const timeline = $('timeline');
  timeline.replaceChildren(...result.timeline.map(event => {
    const duration = event.endMs - event.startMs;
    const segment = el('div', { class: `timeline-segment ${event.kind}` });
    segment.style.width = `${Math.max(62, Math.min(260, duration / horizon * 650))}px`;
    const label = event.kind === 'run' ? event.jobId : event.kind === 'switch' ? 'Switch' : 'Idle';
    segment.append(el('strong', {}, label), el('small', {}, `${format(event.startMs)}–${format(event.endMs)} ms`));
    segment.title = `${label}: ${event.startMs} to ${event.endMs} ms${event.frequency === null ? '' : ` at ${event.frequency}×`}`;
    return segment;
  }));
  table('event-rows', result.timeline.map(event => [event.kind === 'run' ? `Run ${event.jobId}` : event.kind,
    format(event.startMs), format(event.endMs), event.frequency ?? '—', format(event.energyMj)]));
  table('job-detail-rows', result.jobs.map(job => [job.id, format(job.arrivalMs), format(job.firstStartMs),
    format(job.completionMs), format(job.responseMs), format(job.turnaroundMs), format(job.waitingMs)]));
  const metrics = result.metrics;
  const breakdown = $('energy-breakdown');
  breakdown.replaceChildren(...[
    ['Active', metrics.activeEnergyMj], ['Idle', metrics.idleEnergyMj],
    ['Switch', metrics.switchEnergyMj], ['Total', metrics.totalEnergyMj],
  ].flatMap(([name, value]) => [el('dt', {}, name), el('dd', {}, `${format(value)} mJ`)]));
}

const svgNS = 'http://www.w3.org/2000/svg';
function svg(tag, attributes = {}, text = '') {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  node.textContent = text;
  return node;
}
export function renderSweep(sweep) {
  const section = $('sweep-results');
  section.hidden = !sweep?.length;
  if (!sweep?.length) return;
  table('sweep-rows', sweep.map(point => [point.parameters.weight, format(point.metrics.totalEnergyMj),
    format(point.metrics.meanResponseMs), point.nondominated ? 'Nondominated' : 'Dominated']));
  const energies = sweep.map(x => x.metrics.totalEnergyMj);
  const responses = sweep.map(x => x.metrics.meanResponseMs);
  const minX = Math.min(...energies), maxX = Math.max(...energies);
  const minY = Math.min(...responses), maxY = Math.max(...responses);
  // Give identical-valued axes a visible scale without changing the underlying data.
  const xSpan = maxX - minX || Math.max(1, maxX * .1);
  const ySpan = maxY - minY || Math.max(1, maxY * .1);
  const chart = svg('svg', { viewBox: '0 0 700 340', role: 'img', 'aria-label': 'Scatter plot of total energy on the horizontal axis and mean response on the vertical axis. Exact values are in the table below.' });
  chart.append(svg('line', { class: 'axis', x1: 85, y1: 275, x2: 650, y2: 275 }),
    svg('line', { class: 'axis', x1: 85, y1: 275, x2: 85, y2: 30 }),
    svg('text', { x: 290, y: 325 }, 'Total energy (mJ) →'),
    svg('text', { x: 4, y: 22 }, 'Mean response (ms) ↑'),
    svg('text', { x: 85, y: 295 }, format(minX)),
    svg('text', { x: 590, y: 295 }, format(maxX)),
    svg('text', { x: 10, y: 275 }, format(minY)),
    svg('text', { x: 10, y: 40 }, format(maxY)));
  sweep.forEach(point => {
    const x = 85 + (point.metrics.totalEnergyMj - minX) / xSpan * 540;
    const y = 275 - (point.metrics.meanResponseMs - minY) / ySpan * 230;
    const circle = svg('circle', { cx: x, cy: y, r: 8, class: point.nondominated ? 'point frontier' : 'point' });
    circle.append(svg('title', {}, `Weight ${point.parameters.weight}: ${format(point.metrics.totalEnergyMj)} mJ, ${format(point.metrics.meanResponseMs)} ms; ${point.nondominated ? 'nondominated' : 'dominated'}`));
    chart.append(circle);
  });
  $('sweep-chart').replaceChildren(chart);
}
