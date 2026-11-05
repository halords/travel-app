import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { database, databaseConfigured } from './db.js';
import { HttpError, failure, json, readBody, requireSameOrigin } from './http.js';
import { emptyData, type User } from '../src/lib/model.js';

const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters for your password.')
  .max(128, 'Please use 128 characters or fewer.');
const authSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('signup'),
    name: z.string().trim().min(1, 'Enter your name.').max(60),
    email: emailSchema,
    password: passwordSchema,
  }),
  z.object({
    action: z.literal('login'),
    email: emailSchema,
    password: z.string().min(1).max(128),
  }),
  z.object({ action: z.literal('logout') }),
]);

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, expected] = encoded.split(':');
  if (
    algorithm !== 'scrypt' ||
    !/^[a-f0-9]{32}$/.test(salt ?? '') ||
    !/^[a-f0-9]{128}$/.test(expected ?? '')
  )
    return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(expected, 'hex'));
}

const cookieName = () => (process.env.VERCEL ? '__Host-roam_session' : 'roam_session');
function sessionToken(req: IncomingMessage): string | null {
  const value = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName()}=`))
    ?.slice(cookieName().length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function setCookie(res: ServerResponse, token: string, maxAge = sessionLifetime / 1000): void {
  res.setHeader(
    'Set-Cookie',
    `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.VERCEL ? '; Secure' : ''}`,
  );
}

export async function currentUser(req: IncomingMessage): Promise<User | null> {
  const token = sessionToken(req);
  if (!token) return null;
  const db = await database();
  const result = await db.execute({
    sql: 'SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?',
    args: [hash(token), Date.now()],
  });
  const row = result.rows[0];
  return row ? { id: String(row.id), name: String(row.name), email: String(row.email) } : null;
}

export async function requireUser(req: IncomingMessage): Promise<User> {
  const user = await currentUser(req);
  if (!user)
    throw new HttpError(
      401,
      'Sign in again to sync your trips. Your changes are saved on this device.',
    );
  // Cookies are shared across tabs; data operations must target the account shown by the caller.
  if (req.headers['x-roam-account'] !== user.id)
    throw new HttpError(
      401,
      'Your account changed. Sign in again to continue. Your changes are saved on this device.',
    );
  return user;
}

async function rateLimit(key: string, limit: number, interval: number): Promise<void> {
  const db = await database();
  const window = Math.floor(Date.now() / interval) * interval;
  const results = await db.batch(
    [
      {
        sql: 'INSERT INTO auth_attempts (key, window_start, attempts) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET attempts = attempts + 1 RETURNING attempts',
        args: [hash(key), window],
      },
      {
        sql: 'DELETE FROM auth_attempts WHERE window_start < ?',
        args: [Date.now() - 24 * 60 * 60 * 1000],
      },
    ],
    'write',
  );
  if (Number(results[0].rows[0].attempts) > limit)
    throw new HttpError(429, 'Too many attempts. Please try again in 15 minutes.');
}

export async function authHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === 'GET') {
      if (!databaseConfigured()) return json(res, 200, { configured: false, user: null });
      return json(res, 200, { configured: true, user: await currentUser(req) });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      throw new HttpError(405, 'This method is not supported.');
    }
    requireSameOrigin(req);
    if (!databaseConfigured())
      throw new HttpError(
        503,
        'Accounts are not connected yet. You can keep planning on this device.',
      );
    const body = authSchema.parse(await readBody(req));
    const db = await database();
    if (body.action === 'logout') {
      await requireUser(req);
      const token = sessionToken(req);
      if (token)
        await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [hash(token)] });
      setCookie(res, '', 0);
      return json(res, 200, { ok: true });
    }

    const ip = process.env.VERCEL
      ? String(req.headers['x-forwarded-for'] ?? 'unknown')
          .split(',')[0]
          .trim()
      : (req.socket.remoteAddress ?? 'localhost');
    await rateLimit(`ip:${ip}`, 30, 15 * 60 * 1000);
    await rateLimit(`account:${body.email}`, 15, 15 * 60 * 1000);
    let user: User;
    const token = randomBytes(32).toString('hex');
    if (body.action === 'signup') {
      const existing = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: [body.email],
      });
      if (existing.rows.length)
        throw new HttpError(409, 'An account with this email already exists. Try signing in.');
      user = { id: randomUUID(), name: body.name, email: body.email };
      const encoded = await hashPassword(body.password);
      try {
        await db.batch(
          [
            {
              sql: 'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
              args: [user.id, user.email, user.name, encoded, Date.now()],
            },
            {
              sql: 'INSERT INTO workspaces (user_id, revision, payload, updated_at) VALUES (?, 0, ?, ?)',
              args: [user.id, JSON.stringify(emptyData()), Date.now()],
            },
            {
              sql: 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
              args: [hash(token), user.id, Date.now() + sessionLifetime],
            },
          ],
          'write',
        );
      } catch (error) {
        if (String((error as { code?: string }).code).includes('CONSTRAINT'))
          throw new HttpError(409, 'An account with this email already exists. Try signing in.');
        throw error;
      }
    } else {
      const result = await db.execute({
        sql: 'SELECT id, name, email, password_hash FROM users WHERE email = ?',
        args: [body.email],
      });
      const row = result.rows[0];
      // Do equivalent password work even for an unknown email address.
      const encoded = row
        ? String(row.password_hash)
        : `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
      const valid = await verifyPassword(body.password, encoded);
      if (!row || !valid)
        throw new HttpError(401, 'That email and password don’t match. Please try again.');
      user = { id: String(row.id), name: String(row.name), email: String(row.email) };
      await db.batch(
        [
          {
            sql: 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
            args: [hash(token), user.id, Date.now() + sessionLifetime],
          },
          { sql: 'DELETE FROM sessions WHERE expires_at < ?', args: [Date.now()] },
        ],
        'write',
      );
    }
    setCookie(res, token);
    json(res, 200, { user, configured: true });
  } catch (error) {
    failure(res, error);
  }
}
