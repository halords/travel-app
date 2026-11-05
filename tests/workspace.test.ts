// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspace } from '../src/hooks/useWorkspace';
import { dataKey, readData, writeData, writeUser } from '../src/lib/storage';
import { emptyData, savePlace, saveTrip, type AppData, type User } from '../src/lib/model';

const alice: User = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Alice',
  email: 'alice@example.test',
};
const bob: User = {
  id: '20000000-0000-4000-8000-000000000002',
  name: 'Bob',
  email: 'bob@example.test',
};
let session: User | null;
let cloud: Map<string, { revision: number; data: AppData }>;
let isOnline: boolean;
let conflictOnNextWrite: (() => void) | null;
let holdNextRead: ((resolve: (value: unknown) => void) => void) | null;
let holdNextLogout: ((resolve: (value: unknown) => void) => void) | null;
const response = (value: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => structuredClone(value),
  }) as Response;
const trip = (title: string) => ({
  title,
  destination: 'Kyoto, Japan',
  startDate: '2026-11-19',
  endDate: '2026-11-22',
  notes: '',
  cover: 'lavender' as const,
});
const initialTrip = () => saveTrip(emptyData(), trip('A private adventure'));
const stop = (data: AppData, name: string) =>
  savePlace(data, {
    tripId: data.trips[0].id,
    name,
    address: 'Kyoto, Japan',
    latitude: 35,
    longitude: 135,
    date: data.trips[0].startDate,
    time: null,
    duration: 60,
    category: 'sightseeing',
    notes: '',
  });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  session = null;
  cloud = new Map();
  isOnline = true;
  conflictOnNextWrite = null;
  holdNextRead = null;
  holdNextLogout = null;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => isOnline);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit = {}) => {
      if (!isOnline) throw new TypeError('Offline');
      if (url === '/api/auth') {
        if (options.method === 'POST') {
          const body = JSON.parse(String(options.body));
          if (body.action === 'logout') {
            if (!session || new Headers(options.headers).get('X-Roam-Account') !== session.id)
              return response({ error: 'Your account changed.' }, 401);
            session = null;
            if (holdNextLogout) {
              const hold = holdNextLogout;
              holdNextLogout = null;
              await new Promise((resolve) => hold(resolve));
            }
            return response({ ok: true });
          }
          session = body.email === bob.email ? bob : alice;
        }
        return response({ configured: true, user: session });
      }
      if (url !== '/api/sync') throw new Error('Unexpected endpoint');
      if (!session) return response({ error: 'Sign in again.' }, 401);
      if (new Headers(options.headers).get('X-Roam-Account') !== session.id)
        return response({ error: 'Your account changed.' }, 401);
      if (!cloud.has(session.id)) cloud.set(session.id, { revision: 0, data: emptyData() });
      const accountId = session.id;
      if (options.method === 'PUT') {
        if (conflictOnNextWrite) {
          const callback = conflictOnNextWrite;
          conflictOnNextWrite = null;
          callback();
          return response({ error: 'Conflict' }, 409);
        }
        const incoming = JSON.parse(String(options.body));
        const current = cloud.get(accountId)!;
        if (incoming.revision !== current.revision) return response({ error: 'Conflict' }, 409);
        const next = { revision: current.revision + 1, data: structuredClone(incoming.data) };
        cloud.set(accountId, next);
        return response({ revision: next.revision });
      }
      const current = structuredClone(cloud.get(accountId)!);
      if (holdNextRead) {
        const hold = holdNextRead;
        holdNextRead = null;
        await new Promise((resolve) => hold(resolve));
      }
      return response(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const flush = async (time = 750) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(time);
  });
};

describe('the offline workspace', () => {
  it('saves a guest edit immediately and restores it after a reload', async () => {
    const { result, unmount } = renderHook(() => useWorkspace());
    await flush(0);
    act(() => result.current.commit((current) => saveTrip(current, trip('My guest trip'))));
    expect(
      JSON.parse(localStorage.getItem(dataKey())!).trips.some(
        (t: { title: string }) => t.title === 'My guest trip',
      ),
    ).toBe(true);
    unmount();
    const reloaded = renderHook(() => useWorkspace());
    expect(reloaded.result.current.data.trips.some((t) => t.title === 'My guest trip')).toBe(true);
    expect(reloaded.result.current.user).toBeNull();
  });
  it('moves real guest trips into an account without uploading the example trip', async () => {
    const { result } = renderHook(() => useWorkspace());
    await flush(0);
    act(() => result.current.commit((current) => saveTrip(current, trip('Bring this with me'))));
    await act(async () =>
      result.current.authenticate({
        action: 'login',
        email: alice.email,
        password: 'test-only-password',
      }),
    );
    await flush(1500);
    expect(result.current.status).toBe('synced');
    expect(cloud.get(alice.id)?.data.trips.map((t) => t.title)).toEqual(['Bring this with me']);
    expect(result.current.data.trips.every((t) => !t.isDemo)).toBe(true);
    expect(readData().data.trips.every((t) => t.isDemo)).toBe(true);
  });
  it('merges another device’s changes after a revision conflict', async () => {
    const initial = initialTrip();
    session = alice;
    writeUser(alice);
    writeData(initial, alice.id);
    cloud.set(alice.id, { revision: 1, data: initial });
    const { result } = renderHook(() => useWorkspace());
    await flush(1500);
    conflictOnNextWrite = () =>
      cloud.set(alice.id, {
        revision: 2,
        data: stop(cloud.get(alice.id)!.data, 'From my other device'),
      });
    act(() => result.current.commit((current) => stop(current, 'From this device')));
    await flush(1500);
    expect(result.current.status).toBe('synced');
    expect(
      cloud
        .get(alice.id)
        ?.data.places.map((p) => p.name)
        .sort(),
    ).toEqual(['From my other device', 'From this device']);
    expect(result.current.data.places).toHaveLength(2);
  });
  it('includes edits made while a sync request is in flight', async () => {
    const initial = initialTrip();
    session = alice;
    writeUser(alice);
    writeData(initial, alice.id);
    cloud.set(alice.id, { revision: 1, data: initial });
    const { result } = renderHook(() => useWorkspace());
    await flush(1500);
    let release!: (value: unknown) => void;
    holdNextRead = (resolve) => {
      release = resolve;
    };
    let sync!: Promise<boolean>;
    act(() => {
      sync = result.current.synchronize();
    });
    await flush(0);
    act(() => result.current.commit((current) => stop(current, 'Added while syncing')));
    await act(async () => {
      release(undefined);
      await sync;
    });
    expect(cloud.get(alice.id)?.data.places[0]?.name).toBe('Added while syncing');
  });
  it('keeps offline edits, then sends them when the connection returns', async () => {
    const initial = initialTrip();
    writeUser(alice);
    writeData(initial, alice.id);
    session = alice;
    cloud.set(alice.id, { revision: 1, data: initial });
    isOnline = false;
    const { result } = renderHook(() => useWorkspace());
    await flush(0);
    expect(result.current.status).toBe('offline');
    act(() => result.current.commit((current) => stop(current, 'Offline discovery')));
    expect(cloud.get(alice.id)?.data.places).toHaveLength(0);
    expect(readData(alice.id).data.places).toHaveLength(1);
    act(() => {
      isOnline = true;
      window.dispatchEvent(new Event('online'));
    });
    await flush(0); // Let the session response commit before its debounced sync timer starts.
    await flush(1700);
    expect(result.current.status).toBe('synced');
    expect(cloud.get(alice.id)?.data.places[0]?.name).toBe('Offline discovery');
  });
  it('keeps accounts isolated when signing out and signing in as someone else', async () => {
    const initial = initialTrip();
    session = alice;
    writeUser(alice);
    writeData(initial, alice.id);
    cloud.set(alice.id, { revision: 1, data: initial });
    const { result } = renderHook(() => useWorkspace());
    await flush(1500);
    await act(async () => result.current.signOut());
    expect(localStorage.getItem(dataKey(alice.id))).toBeNull();
    expect(result.current.user).toBeNull();
    await act(async () =>
      result.current.authenticate({
        action: 'login',
        email: bob.email,
        password: 'test-only-password',
      }),
    );
    await flush(1500);
    expect(result.current.user?.id).toBe(bob.id);
    expect(result.current.data.trips).toHaveLength(0);
    expect(cloud.get(alice.id)?.data.trips).toHaveLength(1);
  });
  it('does not merge a different account when its cookie changes before a storage event', async () => {
    const initial = initialTrip();
    const other = saveTrip(emptyData(), trip('Bob’s private trip'));
    session = alice;
    writeUser(alice);
    writeData(initial, alice.id);
    cloud.set(alice.id, { revision: 1, data: initial });
    cloud.set(bob.id, { revision: 1, data: other });
    const { result } = renderHook(() => useWorkspace());
    await flush(0);
    await flush(1500);
    expect(result.current.status).toBe('synced');

    session = bob; // Another tab changed the cookie; its storage event has not arrived yet.
    await act(async () => expect(await result.current.synchronize()).toBe(false));

    expect(result.current.status).toBe('signin');
    expect(result.current.data).toEqual(initial);
    expect(readData(alice.id).data).toEqual(initial);
    expect(cloud.get(bob.id)?.data).toEqual(other);
  });
  it('does not upload an old account’s changes if the cookie changes after the sync read', async () => {
    const initial = initialTrip();
    const other = saveTrip(emptyData(), trip('Bob’s private trip'));
    session = alice;
    writeUser(alice);
    writeData(initial, alice.id);
    cloud.set(alice.id, { revision: 1, data: initial });
    cloud.set(bob.id, { revision: 1, data: other });
    const { result } = renderHook(() => useWorkspace());
    await flush(1500);
    act(() => result.current.commit((current) => stop(current, 'Alice’s new stop')));
    let release!: (value: unknown) => void;
    holdNextRead = (resolve) => {
      release = resolve;
    };
    let sync!: Promise<boolean>;
    act(() => {
      sync = result.current.synchronize();
    });
    await flush(0);
    session = bob;
    await act(async () => {
      release(undefined);
      expect(await sync).toBe(false);
    });

    expect(cloud.get(bob.id)?.data).toEqual(other);
    expect(readData(alice.id).data.places[0]?.name).toBe('Alice’s new stop');
    expect(result.current.status).toBe('signin');
  });
  it('keeps edits arriving during logout with their original account', async () => {
    const initial = initialTrip();
    const other = saveTrip(emptyData(), trip('Bob’s private trip'));
    session = alice;
    writeUser(alice);
    writeData(initial, alice.id);
    cloud.set(alice.id, { revision: 1, data: initial });
    cloud.set(bob.id, { revision: 1, data: other });
    const { result } = renderHook(() => useWorkspace());
    await flush(1500);
    let release!: (value: unknown) => void;
    holdNextLogout = (resolve) => {
      release = resolve;
    };
    let logout!: Promise<void>;
    act(() => {
      logout = result.current.signOut();
    });
    await flush(0);
    act(() => result.current.commit((current) => stop(current, 'Added during logout')));
    writeData(stop(readData(alice.id).data, 'Other tab during logout'), alice.id);
    await act(async () => {
      release(undefined);
      await expect(logout).rejects.toThrow('new changes arrived while signing out');
    });

    expect(session).toBeNull();
    expect(result.current.user?.id).toBe(alice.id);
    expect(result.current.authenticated).toBe(false);
    expect(result.current.status).toBe('signin');
    expect(readData(alice.id).data.places).toHaveLength(2);
    expect(result.current.data.places).toHaveLength(2);
    expect(cloud.get(alice.id)?.data.places).toHaveLength(0);

    await act(async () =>
      result.current.authenticate({
        action: 'login',
        email: bob.email,
        password: 'test-only-password',
      }),
    );
    await flush(1500);
    expect(result.current.data).toEqual(other);
    expect(cloud.get(bob.id)?.data).toEqual(other);
    expect(readData(alice.id).data.places).toHaveLength(2);
  });
  it('ignores an old logout response after another tab selects a different account', async () => {
    const initial = initialTrip();
    const other = saveTrip(emptyData(), trip('Bob’s private trip'));
    session = alice;
    writeUser(alice);
    writeData(initial, alice.id);
    writeData(other, bob.id);
    cloud.set(alice.id, { revision: 1, data: initial });
    cloud.set(bob.id, { revision: 1, data: other });
    const { result } = renderHook(() => useWorkspace());
    await flush(1500);
    let release!: (value: unknown) => void;
    holdNextLogout = (resolve) => {
      release = resolve;
    };
    let logout!: Promise<void>;
    act(() => {
      logout = result.current.signOut();
    });
    await flush(0);
    act(() => {
      session = bob;
      writeUser(bob);
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'roam:user:v1', newValue: JSON.stringify(bob) }),
      );
    });
    await flush(0);
    await act(async () => {
      release(undefined);
      await logout;
    });

    expect(result.current.user?.id).toBe(bob.id);
    expect(result.current.data).toEqual(other);
    expect(readData(bob.id).data).toEqual(other);
    expect(JSON.parse(localStorage.getItem('roam:user:v1')!).id).toBe(bob.id);
  });
  it('preserves cached plans after session expiry and refuses to discard unsynced changes', async () => {
    writeUser(alice);
    writeData(stop(initialTrip(), 'Unsynced'), alice.id);
    session = null;
    const { result } = renderHook(() => useWorkspace());
    await flush(0);
    expect(result.current.status).toBe('signin');
    expect(result.current.data.places).toHaveLength(1);
    await expect(result.current.signOut()).rejects.toThrow('Sign in again');
    expect(localStorage.getItem(dataKey(alice.id))).not.toBeNull();
  });
  it('merges another tab’s saved edit before making a new edit', async () => {
    const initial = initialTrip();
    writeData(initial);
    const { result } = renderHook(() => useWorkspace());
    await flush(0);
    writeData(stop(initial, 'Other tab'));
    act(() => result.current.commit((current) => stop(current, 'This tab')));
    expect(
      readData()
        .data.places.map((p) => p.name)
        .sort(),
    ).toEqual(['Other tab', 'This tab']);
  });
  it('makes malformed stored data recoverable instead of silently overwriting it', async () => {
    localStorage.setItem(dataKey(), '{broken backup');
    const { result } = renderHook(() => useWorkspace());
    await flush(0);
    expect(result.current.recoveryBackup).toBe('{broken backup');
    expect(localStorage.getItem(dataKey())).toBe('{broken backup');
    act(() => result.current.commit((current) => saveTrip(current, trip('A fresh start'))));
    expect(localStorage.getItem('roam:recovery:guest')).toBe('{broken backup');
    expect(readData().data.trips[0].title).toBe('A fresh start');
  });
});
