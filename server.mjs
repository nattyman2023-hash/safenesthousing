import { createServer } from 'node:http';
import next from 'next';

const production = process.argv.includes('--production');
if (production) process.env.NODE_ENV = 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const app = next({ dev: !production, hostname, port });
const handle = app.getRequestHandler();

const routerHeaders = [
  'rsc',
  'next-router-state-tree',
  'next-router-prefetch',
  'next-router-segment-prefetch',
  'next-url'
];

function isDocumentNavigation(request) {
  const accept = request.headers.accept || '';
  return request.headers['sec-fetch-dest'] === 'document'
    || (accept.includes('text/html') && !accept.includes('text/x-component'));
}

function sanitizeDocumentNavigation(request) {
  if (!isDocumentNavigation(request)) return;

  const hasFlightHeader = request.headers.rsc === '1';
  const parsed = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const hasFlightQuery = parsed.searchParams.has('_rsc');

  if (!hasFlightHeader && !hasFlightQuery) return;

  for (const header of routerHeaders) delete request.headers[header];
  parsed.searchParams.delete('_rsc');
  request.url = `${parsed.pathname}${parsed.search}`;
}

await app.prepare();

createServer((request, response) => {
  sanitizeDocumentNavigation(request);
  void handle(request, response);
}).listen(port, hostname, () => {
  console.log(`Safe Nest ${production ? 'production' : 'development'} server listening on ${hostname}:${port}`);
});
