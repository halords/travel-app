import { mkdir } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { schema } from '../server/db.ts';

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local first.');
  process.exit(1);
}
if (url.startsWith('file:')) await mkdir('.local', { recursive: true });
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
try {
  await db.batch(schema, 'write');
  console.log('Roam database is ready.');
} catch {
  console.error('Could not connect. Check your database URL and token.');
  process.exitCode = 1;
} finally {
  db.close();
}
