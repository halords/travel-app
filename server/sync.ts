import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { dataSchema, emptyData } from '../src/lib/model.js';
import { database } from './db.js';
import { requireUser } from './auth.js';
import { HttpError, failure, json, readBody, requireSameOrigin } from './http.js';

const syncSchema = z.object({
  revision: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1),
  data: dataSchema,
});

export async function syncHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (!['GET', 'PUT'].includes(req.method ?? '')) {
      res.setHeader('Allow', 'GET, PUT');
      throw new HttpError(405, 'This method is not supported.');
    }
    if (req.method === 'PUT') requireSameOrigin(req);
    const user = await requireUser(req);
    const db = await database();
    if (req.method === 'GET') {
      const result = await db.execute({
        sql: 'SELECT revision, payload FROM workspaces WHERE user_id = ?',
        args: [user.id],
      });
      const row = result.rows[0];
      return json(res, 200, {
        revision: Number(row?.revision ?? 0),
        data: row ? dataSchema.parse(JSON.parse(String(row.payload))) : emptyData(),
      });
    }
    const body = syncSchema.parse(await readBody(req));
    const result = await db.execute({
      sql: 'UPDATE workspaces SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision',
      args: [JSON.stringify(body.data), Date.now(), user.id, body.revision],
    });
    if (!result.rows.length)
      throw new HttpError(409, 'Another device updated this trip. Merging your changes…');
    json(res, 200, { revision: Number(result.rows[0].revision) });
  } catch (error) {
    failure(res, error);
  }
}
