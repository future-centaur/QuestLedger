import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config();

const { ensureMigrated } = await import('./db/migrate.js');
const { handleNode } = await import('./http/nodeAdapter.js');

await ensureMigrated();

const port = Number(process.env.PORT || 8787);
const api = createServer((req, res) => {
  handleNode(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: 'Server error' }));
    }
  });
});

await new Promise<void>((resolve) => api.listen(port, resolve));
console.log(`API listening on http://localhost:${port}`);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const ui = spawn(process.execPath, [viteBin], { cwd: root, stdio: 'inherit', env: process.env });

function stop(code = 0) {
  ui.kill();
  api.close();
  process.exit(code);
}

ui.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
