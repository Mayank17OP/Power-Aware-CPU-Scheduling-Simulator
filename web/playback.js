const $ = id => document.getElementById(id);
const pretty = n => Number(n.toFixed(2)).toFixed(2);
let result = null, current = 0, raf = null, lastFrame = 0;
const durationMs = 5500;
function stop() { if (raf !== null) cancelAnimationFrame(raf); raf = null; lastFrame = 0; $('playback-toggle').textContent = '▶ Play schedule'; $('results').querySelector('.playback').classList.remove('is-running'); }
function paint() {
  if (!result) return;
  const time = result.horizonMs * current;
  const eventIndex = result.timeline.findIndex((event, index) => time >= event.startMs &&
    (time < event.endMs || (current === 1 && index === result.timeline.length - 1)));
  const event = result.timeline[eventIndex];
  const label = current === 1 ? 'Schedule complete' : !event ? 'Ready to replay' :
    event.kind === 'run' ? `Running job ${event.jobId} · ${event.frequency}× speed` :
      event.kind === 'switch' ? 'Switching jobs' : 'CPU idle · waiting for arrival';
  $('playback-state').textContent = label;
  $('playback-clock').textContent = `${pretty(time)} ms / ${pretty(result.horizonMs)} ms`;
  $('playback-seek').value = Math.round(current * 1000);
  $('playback-badge').textContent = current === 1 ? 'COMPLETE' : raf !== null ? 'PLAYING' : 'PAUSED';
  document.querySelectorAll('.timeline-segment').forEach((segment, index) => segment.classList.toggle('active', index === eventIndex));
  if (eventIndex >= 0) document.querySelectorAll('.timeline-segment')[eventIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function tick(now) {
  if (lastFrame) current = Math.min(1, current + (now - lastFrame) / durationMs);
  lastFrame = now;
  if (current === 1) { stop(); paint(); return; }
  raf = requestAnimationFrame(tick);
  paint();
}
export function setPlayback(next) { stop(); result = next; current = 0; paint(); $('playback-badge').textContent = 'READY'; }
$('playback-toggle').addEventListener('click', () => {
  if (!result) return;
  if (raf !== null) { stop(); paint(); return; }
  if (current === 1) current = 0;
  $('playback-toggle').textContent = 'Ⅱ Pause';
  $('results').querySelector('.playback').classList.add('is-running');
  raf = requestAnimationFrame(tick);
});
$('playback-reset').addEventListener('click', () => { stop(); current = 0; paint(); });
$('playback-seek').addEventListener('input', event => { stop(); current = Number(event.target.value) / 1000; paint(); });
