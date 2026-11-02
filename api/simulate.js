import { runComparison } from '../src/policies.js';

/** Vercel's Node.js function for the same simulation used by the local server. */
export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Use POST to run a simulation.' });
  }

  try {
    // Vercel parses JSON into req.body; also accept raw JSON for direct invocation/tests.
    const raw = request.body;
    if (raw === undefined || raw === null) throw new SyntaxError('Missing JSON body');
    const size = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw));
    if (size > 256000) return response.status(413).json({ error: 'Workload is too large.' });
    const input = typeof raw === 'string' || Buffer.isBuffer(raw) ? JSON.parse(raw.toString()) : raw;
    return response.status(200).json(runComparison(input));
  } catch (error) {
    return response.status(400).json({ error: error instanceof SyntaxError ? 'Invalid JSON input.' : error.message });
  }
}
