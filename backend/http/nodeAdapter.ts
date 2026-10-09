import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleRequest } from './nodeHandler.js';

/** Node and Vercel both call the same Web handler. */
export async function handleNode(req: IncomingMessage, res: ServerResponse) {
  const host = header(req, 'x-forwarded-host') || header(req, 'host') || 'localhost';
  const proto = header(req, 'x-forwarded-proto') || 'http';
  const url = new URL(req.url || '/', `${proto}://${host}`);
  const raw = await rawBody(req);
  const request = new Request(url, {
    method: req.method,
    headers: flatten(req.rawHeaders),
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : raw,
  });
  const response = await handleRequest(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
  const bytes = Buffer.from(await response.arrayBuffer());
  res.end(bytes.length ? bytes : undefined);
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function flatten(raw: string[]): Headers {
  const headers = new Headers();
  for (let i = 0; i < raw.length; i += 2) headers.append(raw[i], raw[i + 1]);
  return headers;
}

async function rawBody(req: IncomingMessage): Promise<string> {
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  const type = header(req, 'content-type') || '';
  if (parsed !== undefined && parsed !== null) {
    if (typeof parsed === 'string') return parsed;
    if (Buffer.isBuffer(parsed)) return parsed.toString();
    if (type.includes('application/x-www-form-urlencoded')) return new URLSearchParams(parsed as Record<string, string>).toString();
    return JSON.stringify(parsed);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}
