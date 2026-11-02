import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { runComparison } from './src/policies.js';

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT || 8000);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const send = (res, code, data, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
};
export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/simulate') {
    if (req.method !== 'POST') return send(res, 405, JSON.stringify({ error: 'Use POST to run a simulation.' }));
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 256000) return send(res, 413, JSON.stringify({ error: 'Workload is too large.' }));
      }
      const result = runComparison(JSON.parse(body));
      return send(res, 200, JSON.stringify(result));
    } catch (error) {
      return send(res, 400, JSON.stringify({ error: error instanceof SyntaxError ? 'Invalid JSON input.' : error.message }));
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  try {
    const decoded = decodeURIComponent(url.pathname);
    const path = resolve(root, '.' + decoded, decoded.endsWith('/') ? 'index.html' : '');
    if (path !== root && !path.startsWith(root + sep)) return send(res, 403, 'Forbidden', 'text/plain');
    if (path.includes(`${sep}.git${sep}`) || path.endsWith(`${sep}.git`)) return send(res, 403, 'Forbidden', 'text/plain');
    if (!(await stat(path)).isFile()) return send(res, 404, 'Not found', 'text/plain');
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { send(res, 404, 'Not found', 'text/plain'); }
});
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  server.listen(port, '0.0.0.0', () => console.log(`Simulator website listening on 0.0.0.0:${port}`));
}
