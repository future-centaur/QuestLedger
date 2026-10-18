import type { IncomingMessage, ServerResponse } from 'node:http';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { handleNode } = await import('../backend/http/nodeAdapter.js');
    return await handleNode(req, res);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.stack || error.message : String(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
    }
    res.end(JSON.stringify({ message }));
  }
}
