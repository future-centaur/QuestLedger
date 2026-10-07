import { createServer } from 'node:http';
import { config } from 'dotenv';

config();

const { handleNode } = await import('./http/nodeAdapter');
const port = Number(process.env.PORT || 8787);

createServer((req, res) => {
  handleNode(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: 'Server error' }));
    }
  });
}).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
