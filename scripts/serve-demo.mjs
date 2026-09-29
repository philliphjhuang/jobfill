// Serves demo/ on http://localhost:5173 so the extension can be tried on
// realistic mock application forms without touching real job sites.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.pdf': 'application/pdf',
};

/** Start the demo server; resolves with the bound port (0 = pick a free one). */
export function startDemoServer(port = 5173) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '') || 'index.html';
    const file = join(root, rel);
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { port } = await startDemoServer(Number(process.env.PORT) || 5173);
  console.log(`Demo forms at http://localhost:${port}`);
}
