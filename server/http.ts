import type { IncomingMessage, ServerResponse } from 'node:http';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

export function failure(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) return json(res, error.status, { error: error.message });
  if (error instanceof ZodError)
    return json(res, 400, {
      error: error.issues[0]?.message ?? 'Please check the details you entered.',
    });
  console.error(
    '[Roam API] A request failed:',
    error instanceof Error ? error.name : 'Unknown error',
  );
  json(res, 503, {
    error:
      'We couldn’t connect right now. Your saved trips are still on this device. Please try again.',
  });
}

export function requireSameOrigin(req: IncomingMessage): void {
  if (
    !req.headers['content-type']?.startsWith('application/json') ||
    req.headers['x-roam-client'] !== '1'
  )
    throw new HttpError(403, 'Please make this request from Roam.');
  const origin = req.headers.origin;
  try {
    if (!origin || new URL(origin).host !== req.headers.host) throw new Error('Origin mismatch');
  } catch {
    throw new HttpError(403, 'Please make this request from Roam.');
  }
}

export async function readBody(req: IncomingMessage): Promise<unknown> {
  const maxBytes = 2 * 1024 * 1024;
  if (Number(req.headers['content-length']) > maxBytes)
    throw new HttpError(413, 'This backup is too large. Please keep it under 2 MB.');
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined) {
    const raw = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    if (Buffer.byteLength(raw) > maxBytes)
      throw new HttpError(413, 'This backup is too large. Please keep it under 2 MB.');
    try {
      return JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'The request is not valid JSON.');
    }
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes)
      throw new HttpError(413, 'This backup is too large. Please keep it under 2 MB.');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'The request is not valid JSON.');
  }
}
