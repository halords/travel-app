import type { AppData, User } from './model';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  accountId?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Roam-Client': '1' }),
        ...(accountId ? { 'X-Roam-Account': accountId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let result: T & { error?: string };
    try {
      result = await response.json();
    } catch {
      throw new ApiError(
        503,
        'Sync is unavailable right now. Your trips are saved on this device.',
      );
    }
    if (!response.ok)
      throw new ApiError(
        response.status,
        result.error ?? 'Something went wrong. Please try again.',
      );
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      'Couldn’t connect. Your trips are saved here and will sync when you’re back online.',
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export type SessionResponse = { configured: boolean; user: User | null };
export type SyncResponse = { revision: number; data: AppData };
export type AuthInput = {
  action: 'signup' | 'login';
  email: string;
  password: string;
  name?: string;
};
