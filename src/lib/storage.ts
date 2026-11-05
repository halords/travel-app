import { dataSchema, emptyData, type AppData, type Preferences, type User } from './model';
import { demoData } from './demo';

export const dataKey = (userId?: string) => `roam:data:v1:${userId ?? 'guest'}`;
const userKey = 'roam:user:v1';
const preferencesKey = 'roam:preferences:v1';

export function readData(userId?: string): { data: AppData; error?: string; rawBackup?: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(dataKey(userId));
    if (raw) return { data: dataSchema.parse(JSON.parse(raw)) };
    const data = userId ? emptyData() : demoData();
    localStorage.setItem(dataKey(userId), JSON.stringify(data));
    return { data };
  } catch {
    // Never overwrite a corrupt or inaccessible stored copy with an empty document.
    return {
      data: emptyData(),
      error:
        'Your saved trips could not be opened. Download the original data before restoring a backup or signing in.',
      rawBackup: raw ?? undefined,
    };
  }
}

export function writeData(data: AppData, userId?: string): void {
  const existing = localStorage.getItem(dataKey(userId));
  if (existing) {
    let valid = false;
    try {
      valid = dataSchema.safeParse(JSON.parse(existing)).success;
    } catch {
      /* Preserve malformed data before any explicit edit. */
    }
    if (!valid) localStorage.setItem(`roam:recovery:${userId ?? 'guest'}`, existing);
  }
  localStorage.setItem(dataKey(userId), JSON.stringify(data));
}

export function readUser(): User | null {
  try {
    const raw = JSON.parse(localStorage.getItem(userKey) ?? 'null');
    if (
      raw &&
      typeof raw.id === 'string' &&
      typeof raw.email === 'string' &&
      typeof raw.name === 'string'
    )
      return { id: raw.id, name: raw.name, email: raw.email };
  } catch {
    /* A fresh device has no remembered account. */
  }
  return null;
}

export function writeUser(user: User | null): void {
  if (user) localStorage.setItem(userKey, JSON.stringify(user));
  else localStorage.removeItem(userKey);
}

export function readPreferences(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(preferencesKey) ?? '{}');
    return {
      mapProvider: raw.mapProvider === 'apple' ? 'apple' : 'google',
      travelMode: ['walking', 'transit', 'driving'].includes(raw.travelMode)
        ? raw.travelMode
        : 'walking',
    };
  } catch {
    return { mapProvider: 'google', travelMode: 'walking' };
  }
}

export function writePreferences(preferences: Preferences): void {
  localStorage.setItem(preferencesKey, JSON.stringify(preferences));
}
