import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleNode } from '../backend/http/nodeAdapter';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleNode(req, res);
}
