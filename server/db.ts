import { createClient, type Client } from '@libsql/client';

export const schema = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS workspaces (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT NOT NULL, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL, PRIMARY KEY(key, window_start))`,
];

let client: Client | undefined;
let initialized: Promise<void> | undefined;
let configuration = '';

export function databaseConfigured(): boolean {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return false;
  if (url.startsWith('file:')) return !process.env.VERCEL;
  return !!process.env.TURSO_AUTH_TOKEN && /^(libsql|https):\/\//.test(url);
}

export async function database(): Promise<Client> {
  if (!databaseConfigured()) throw new Error('Database is not configured');
  const url = process.env.TURSO_DATABASE_URL!;
  const signature = `${url}\0${process.env.TURSO_AUTH_TOKEN ?? ''}`;
  if (!client || configuration !== signature) {
    client?.close();
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
    configuration = signature;
    initialized = undefined;
  }
  const current = client;
  if (!initialized)
    initialized = current
      .batch(schema, 'write')
      .then(() => undefined)
      .catch((error) => {
        initialized = undefined;
        throw error;
      });
  await initialized;
  return current;
}
