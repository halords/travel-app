import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { authHandler, hashPassword, verifyPassword } from '../server/auth';
import { syncHandler } from '../server/sync';
import { database } from '../server/db';
import { emptyData, saveTrip } from '../src/lib/model';

let server: Server;
let origin: string;
const password = 'Only-for-Roam-tests-42!';
type ResponseBody = {
  user?: { id: string; name: string; email: string } | null;
  configured?: boolean;
  error?: string;
  revision?: number;
  data?: ReturnType<typeof emptyData>;
};
async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    accountId?: string;
    origin?: string;
    clientHeader?: boolean;
  } = {},
) {
  const headers: Record<string, string> = { Origin: options.origin ?? origin };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.accountId) headers['X-Roam-Account'] = options.accountId;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    if (options.clientHeader !== false) headers['X-Roam-Client'] = '1';
  }
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = (await response.json()) as ResponseBody;
  const setCookie = response.headers.get('set-cookie');
  return {
    status: response.status,
    body,
    cookie: setCookie?.split(';')[0] ?? '',
    setCookie,
    cacheControl: response.headers.get('cache-control'),
  };
}
async function register(email = `${randomUUID()}@example.test`) {
  return request('/api/auth', {
    method: 'POST',
    body: { action: 'signup', name: 'Test Traveller', email, password },
  });
}

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  process.env.TURSO_AUTH_TOKEN = '';
  delete process.env.VERCEL;
  server = createServer((req, res) => {
    const path = req.url?.split('?')[0];
    if (path === '/api/auth') void authHandler(req, res);
    else if (path === '/api/sync') void syncHandler(req, res);
    else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await (await database()).execute('DELETE FROM auth_attempts');
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  (await database()).close();
});

describe('passwords and sessions', () => {
  it('salts password hashes and rejects a different password', async () => {
    const first = await hashPassword(password),
      second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('incorrect-password', first)).toBe(false);
    expect(await verifyPassword(password, 'malformed')).toBe(false);
  });
  it('registers a normalized email with an HttpOnly session and stores no raw session secret', async () => {
    const account = await register('TEST.TRAVELLER@EXAMPLE.TEST');
    expect(account.status).toBe(200);
    expect(account.body.user?.email).toBe('test.traveller@example.test');
    expect(account.setCookie).toContain('HttpOnly');
    expect(account.setCookie).toContain('SameSite=Lax');
    expect(account.cacheControl).toBe('no-store');
    const me = await request('/api/auth', { cookie: account.cookie });
    expect(me.body.user?.id).toBe(account.body.user?.id);
    const db = await database();
    const row = (
      await db.execute({
        sql: 'SELECT password_hash FROM users WHERE id = ?',
        args: [account.body.user!.id],
      })
    ).rows[0];
    expect(String(row.password_hash)).toMatch(/^scrypt:/);
    expect(String(row.password_hash)).not.toContain(password);
    const session = (
      await db.execute({
        sql: 'SELECT token_hash FROM sessions WHERE user_id = ?',
        args: [account.body.user!.id],
      })
    ).rows[0];
    expect(session.token_hash).not.toBe(account.cookie.split('=')[1]);
  });
  it('signs in, rejects incorrect credentials, and revokes the session on sign-out', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    const invalid = await request('/api/auth', {
      method: 'POST',
      body: { action: 'login', email, password: 'wrong-password' },
    });
    expect(invalid.status).toBe(401);
    const login = await request('/api/auth', {
      method: 'POST',
      body: { action: 'login', email, password },
    });
    expect(login.status).toBe(200);
    expect(
      (await request('/api/sync', { cookie: login.cookie, accountId: login.body.user!.id })).status,
    ).toBe(200);
    const logout = await request('/api/auth', {
      method: 'POST',
      cookie: login.cookie,
      accountId: login.body.user!.id,
      body: { action: 'logout' },
    });
    expect(logout.setCookie).toContain('Max-Age=0');
    expect(
      (await request('/api/sync', { cookie: login.cookie, accountId: login.body.user!.id })).status,
    ).toBe(401);
  });
  it('expires old sessions', async () => {
    const account = await register();
    await (
      await database()
    ).execute({
      sql: 'UPDATE sessions SET expires_at = 0 WHERE user_id = ?',
      args: [account.body.user!.id],
    });
    expect((await request('/api/auth', { cookie: account.cookie })).body.user).toBeNull();
    expect(
      (await request('/api/sync', { cookie: account.cookie, accountId: account.body.user!.id }))
        .status,
    ).toBe(401);
  });
  it('does not revoke a session when logout targets a missing or different account', async () => {
    const alice = await register(),
      bob = await register();
    for (const accountId of [undefined, alice.body.user!.id]) {
      const logout = await request('/api/auth', {
        method: 'POST',
        cookie: bob.cookie,
        accountId,
        body: { action: 'logout' },
      });
      expect(logout.status).toBe(401);
      expect(logout.setCookie).toBeNull();
      expect((await request('/api/auth', { cookie: bob.cookie })).body.user?.id).toBe(
        bob.body.user!.id,
      );
    }
  });
  it('requires strong registration inputs and handles duplicate email addresses', async () => {
    expect(
      (
        await request('/api/auth', {
          method: 'POST',
          body: { action: 'signup', name: 'Test', email: 'test@example.test', password: 'short' },
        })
      ).status,
    ).toBe(400);
    const email = `${randomUUID()}@example.test`;
    const results = await Promise.all([register(email), register(email)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('rejects cross-origin mutations and requests without the client header', async () => {
    const account = await register();
    const body = { action: 'logout' };
    expect(
      (
        await request('/api/auth', {
          method: 'POST',
          cookie: account.cookie,
          accountId: account.body.user!.id,
          body,
          origin: 'https://unrelated.example',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request('/api/auth', {
          method: 'POST',
          cookie: account.cookie,
          accountId: account.body.user!.id,
          body,
          clientHeader: false,
        })
      ).status,
    ).toBe(403);
    expect((await request('/api/auth', { cookie: account.cookie })).body.user).not.toBeNull();
  });
  it('limits repeated authentication attempts persistently', async () => {
    const email = `${randomUUID()}@example.test`;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 16; attempt++)
      lastStatus = (
        await request('/api/auth', {
          method: 'POST',
          body: { action: 'login', email, password: 'wrong-password' },
        })
      ).status;
    expect(lastStatus).toBe(429);
  });
});

describe('private itinerary sync', () => {
  it('requires authentication', async () => {
    expect((await request('/api/sync')).status).toBe(401);
  });
  it('rejects reads and writes for a missing or different expected account', async () => {
    const alice = await register(),
      bob = await register();
    const data = saveTrip(emptyData(), {
      title: 'Bob’s private trip',
      destination: 'Tokyo, Japan',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      cover: 'blue',
      notes: 'Private note',
    });
    expect(
      (
        await request('/api/sync', {
          method: 'PUT',
          cookie: bob.cookie,
          accountId: bob.body.user!.id,
          body: { revision: 0, data },
        })
      ).status,
    ).toBe(200);

    for (const accountId of [undefined, alice.body.user!.id]) {
      const read = await request('/api/sync', { cookie: bob.cookie, accountId });
      expect(read.status).toBe(401);
      expect(read.body.data).toBeUndefined();
      expect(
        (
          await request('/api/sync', {
            method: 'PUT',
            cookie: bob.cookie,
            accountId,
            body: { revision: 1, data: emptyData() },
          })
        ).status,
      ).toBe(401);
    }
    const own = await request('/api/sync', { cookie: bob.cookie, accountId: bob.body.user!.id });
    expect(own.body.data).toEqual(data);
    expect(own.body.revision).toBe(1);
  });
  it('isolates accounts and refuses to overwrite a newer revision', async () => {
    const alice = await register(),
      bob = await register();
    const data = saveTrip(emptyData(), {
      title: 'Private trip',
      destination: 'Tokyo, Japan',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      cover: 'blue',
      notes: 'Private note',
    });
    const saved = await request('/api/sync', {
      method: 'PUT',
      cookie: alice.cookie,
      accountId: alice.body.user!.id,
      body: { revision: 0, data },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(1);
    const other = await request(`/api/sync?user_id=${alice.body.user!.id}`, {
      cookie: bob.cookie,
      accountId: bob.body.user!.id,
    });
    expect(other.body.data?.trips).toHaveLength(0);
    const own = await request('/api/sync', {
      cookie: alice.cookie,
      accountId: alice.body.user!.id,
    });
    expect(own.body.data?.trips[0].title).toBe('Private trip');
    const stale = await request('/api/sync', {
      method: 'PUT',
      cookie: alice.cookie,
      accountId: alice.body.user!.id,
      body: { revision: 0, data: emptyData() },
    });
    expect(stale.status).toBe(409);
    expect(
      (await request('/api/sync', { cookie: alice.cookie, accountId: alice.body.user!.id })).body
        .data?.trips,
    ).toHaveLength(1);
    expect(own.cacheControl).toBe('no-store');
  });
  it('rejects invalid data and oversized requests before saving', async () => {
    const account = await register();
    expect(
      (
        await request('/api/sync', {
          method: 'PUT',
          cookie: account.cookie,
          accountId: account.body.user!.id,
          body: { revision: 0, data: { version: 99, trips: [], places: [] } },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/sync', {
          method: 'PUT',
          cookie: account.cookie,
          accountId: account.body.user!.id,
          body: { padding: 'x'.repeat(2 * 1024 * 1024) },
        })
      ).status,
    ).toBe(413);
    expect(
      (await request('/api/sync', { cookie: account.cookie, accountId: account.body.user!.id }))
        .body.revision,
    ).toBe(0);
  });
  it('keeps local-only mode usable when the cloud database is not configured', async () => {
    const url = process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_DATABASE_URL;
    try {
      const session = await request('/api/auth');
      expect(session.status).toBe(200);
      expect(session.body.configured).toBe(false);
      expect((await register()).status).toBe(503);
    } finally {
      process.env.TURSO_DATABASE_URL = url;
    }
  });
});
