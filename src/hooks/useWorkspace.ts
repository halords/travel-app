import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type AuthInput, type SessionResponse, type SyncResponse } from '../lib/api';
import {
  dataSchema,
  emptyData,
  mergeData,
  nonDemoData,
  type AppData,
  type User,
} from '../lib/model';
import { dataKey, readData, readUser, writeData, writeUser } from '../lib/storage';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error' | 'signin';

export function useWorkspace() {
  const [initial] = useState(() => {
    const user = readUser();
    return { user, ...readData(user?.id) };
  });
  const [user, setUser] = useState<User | null>(initial.user);
  const [data, setData] = useState<AppData>(initial.data);
  const [error, setError] = useState(initial.error ?? '');
  const [recoveryBackup, setRecoveryBackup] = useState<string | undefined>(initial.rawBackup);
  const [online, setOnline] = useState(navigator.onLine);
  const [authenticated, setAuthenticated] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SyncStatus>(initial.user ? 'syncing' : 'local');
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const userRef = useRef(user);
  const dataRef = useRef(data);
  const inFlight = useRef(false);
  const authGeneration = useRef(0);
  const lastSyncedData = useRef<{ accountId: string; value: string } | null>(null);
  const syncRef = useRef<() => Promise<boolean>>(async () => false);

  const commit = useCallback((change: AppData | ((current: AppData) => AppData)) => {
    let base = dataRef.current;
    try {
      const raw = localStorage.getItem(dataKey(userRef.current?.id));
      const stored = raw ? dataSchema.safeParse(JSON.parse(raw)) : null;
      if (stored?.success) base = mergeData(base, stored.data);
    } catch {
      /* A storage warning is raised below if saving also fails. */
    }
    const next = typeof change === 'function' ? change(base) : mergeData(base, change);
    if (JSON.stringify(next) === JSON.stringify(dataRef.current)) return;
    try {
      writeData(next, userRef.current?.id);
    } catch {
      setError(
        'This device couldn’t save your latest changes. Export a backup before closing Roam.',
      );
    }
    dataRef.current = next;
    setData(next);
  }, []);

  const adoptUser = useCallback((nextUser: User, moveGuest: boolean) => {
    const previousUser = userRef.current;
    if (previousUser?.id !== nextUser.id) {
      setError('');
      setRecoveryBackup(undefined);
    }
    let next = previousUser?.id === nextUser.id ? dataRef.current : readData(nextUser.id).data;
    if (!previousUser && moveGuest) next = mergeData(next, nonDemoData(dataRef.current));
    try {
      writeData(next, nextUser.id);
      writeUser(nextUser);
      // The local copy has been durably transferred; do not offer it to another account later.
      if (!previousUser && moveGuest) {
        const guest = dataRef.current;
        const demoIds = new Set(guest.trips.filter((t) => t.isDemo).map((t) => t.id));
        writeData({
          version: 1,
          trips: guest.trips.filter((t) => demoIds.has(t.id)),
          places: guest.places.filter((p) => demoIds.has(p.tripId)),
        });
      }
    } catch {
      setError('This device is running out of storage. Export a backup of your trips.');
    }
    userRef.current = nextUser;
    dataRef.current = next;
    setUser(nextUser);
    setData(next);
    setAuthenticated(true);
    setConfigured(true);
    setStatus('syncing');
  }, []);

  const checkSession = useCallback(async () => {
    const generation = authGeneration.current;
    try {
      const result = await api<SessionResponse>('/api/auth');
      if (generation !== authGeneration.current) return;
      setConfigured(result.configured);
      if (result.user) adoptUser(result.user, true);
      else {
        setAuthenticated(false);
        setStatus(userRef.current ? 'signin' : 'local');
      }
    } catch {
      if (generation !== authGeneration.current) return;
      setStatus(userRef.current ? 'offline' : 'local');
    }
  }, [adoptUser]);

  const synchronize = useCallback(async (): Promise<boolean> => {
    if (!userRef.current || !authenticated) return false;
    if (!navigator.onLine) {
      setStatus('offline');
      return false;
    }
    if (inFlight.current) return false;
    inFlight.current = true;
    const accountId = userRef.current.id;
    const generation = authGeneration.current;
    const isCurrent = () =>
      userRef.current?.id === accountId && authGeneration.current === generation;
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (!isCurrent()) return false;
        const remote = await api<SyncResponse>('/api/sync', 'GET', undefined, accountId);
        if (!isCurrent()) return false;
        const remoteData = dataSchema.parse(remote.data);
        const combined = mergeData(remoteData, dataRef.current);
        commit(combined);
        if (JSON.stringify(mergeData(emptyData(), remoteData)) !== JSON.stringify(combined)) {
          try {
            await api('/api/sync', 'PUT', { revision: remote.revision, data: combined }, accountId);
          } catch (failure) {
            if (failure instanceof ApiError && failure.status === 409) continue;
            throw failure;
          }
        }
        if (!isCurrent()) return false;
        // An edit made while the request was in flight must get its own upload.
        if (JSON.stringify(dataRef.current) !== JSON.stringify(combined)) continue;
        lastSyncedData.current = { accountId, value: JSON.stringify(combined) };
        setLastSynced(Date.now());
        setStatus('synced');
        return true;
      }
      setStatus('error');
      return false;
    } catch (failure) {
      if (!isCurrent()) return false;
      if (failure instanceof ApiError && failure.status === 401) {
        setAuthenticated(false);
        setStatus('signin');
      } else {
        setStatus(navigator.onLine ? 'error' : 'offline');
        if (failure instanceof ApiError && [400, 413].includes(failure.status))
          setError(failure.message);
      }
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [authenticated, commit]);
  syncRef.current = synchronize;

  useEffect(() => {
    void checkSession();
  }, [checkSession]);
  useEffect(() => {
    const change = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine && userRef.current) void checkSession();
    };
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
    };
  }, [checkSession]);

  useEffect(() => {
    if (!online) {
      if (user) setStatus('offline');
      return;
    }
    if (!authenticated) return;
    const timer = window.setTimeout(() => {
      void syncRef.current();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [data, authenticated, online, user]);

  useEffect(() => {
    const focus = () => {
      if (document.visibilityState === 'visible') {
        if (authenticated) void syncRef.current();
        else if (userRef.current) void checkSession();
      }
    };
    const interval = window.setInterval(focus, 45_000);
    window.addEventListener('focus', focus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', focus);
    };
  }, [authenticated, checkSession]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === dataKey(userRef.current?.id) && event.newValue) {
        try {
          const result = dataSchema.safeParse(JSON.parse(event.newValue));
          if (result.success) commit((current) => mergeData(current, result.data));
        } catch {
          setError(
            'Another tab sent data that could not be opened. Your current plans are still here.',
          );
        }
      }
      if (event.key === 'roam:user:v1') {
        const next = readUser();
        if (next?.id === userRef.current?.id) return;
        authGeneration.current++;
        userRef.current = next;
        dataRef.current = readData(next?.id).data;
        setUser(next);
        setData(dataRef.current);
        setAuthenticated(false);
        setStatus(next ? 'syncing' : 'local');
        void checkSession();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [checkSession, commit]);

  const authenticate = async (input: AuthInput) => {
    authGeneration.current++;
    const result = await api<SessionResponse>('/api/auth', 'POST', input);
    if (!result.user) throw new Error('Please try signing in again.');
    adoptUser(result.user, true);
  };

  const signOut = async () => {
    const previous = userRef.current;
    const generation = authGeneration.current;
    const isCurrent = () =>
      userRef.current?.id === previous?.id && authGeneration.current === generation;
    if (!navigator.onLine) throw new Error('Go online to finish syncing and sign out securely.');
    if (userRef.current && !authenticated)
      throw new Error(
        'Sign in again to sync your latest changes before signing out. You can also export a backup first.',
      );
    if (authenticated && !(await synchronize()))
      throw new Error(
        'Your latest changes haven’t finished syncing. Please try again in a moment, or export a backup.',
      );
    if (!isCurrent()) return;
    const synced = lastSyncedData.current;
    try {
      await api('/api/auth', 'POST', { action: 'logout' }, previous?.id);
    } catch (failure) {
      if (isCurrent() && failure instanceof ApiError && failure.status === 401) {
        setAuthenticated(false);
        setStatus('signin');
      }
      throw failure;
    }
    if (!isCurrent()) return;
    authGeneration.current++;
    setAuthenticated(false);
    setStatus(previous ? 'signin' : 'local');
    if (previous) {
      // Another tab may have saved an edit before its storage event reaches this tab.
      const stored = readData(previous.id);
      if (stored.error) {
        setError(stored.error);
        setRecoveryBackup(stored.rawBackup);
        throw new Error(
          'Your session has ended, but this device’s saved data could not be checked. Export a backup before trying to sign out again.',
        );
      }
      const latest = mergeData(dataRef.current, stored.data);
      if (synced?.accountId !== previous.id || JSON.stringify(latest) !== synced.value) {
        // Keep late edits attached to their account until they can be uploaded or exported.
        dataRef.current = latest;
        setData(latest);
        try {
          writeData(latest, previous.id);
        } catch {
          setError(
            'This device couldn’t save your latest changes. Keep Roam open and export a backup.',
          );
          throw new Error(
            'Your session has ended. Export a backup before closing Roam to preserve your latest changes.',
          );
        }
        throw new Error(
          'Your session has ended, but new changes arrived while signing out. Sign in again to sync them, or export a backup.',
        );
      }
    }
    writeUser(null);
    if (previous) {
      localStorage.removeItem(dataKey(previous.id));
      localStorage.removeItem(`roam:recovery:${previous.id}`);
    }
    userRef.current = null;
    dataRef.current = readData().data;
    setUser(null);
    setData(dataRef.current);
    setAuthenticated(false);
    setStatus('local');
    setLastSynced(null);
    setError('');
    setRecoveryBackup(undefined);
  };

  return {
    data,
    commit,
    user,
    online,
    authenticated,
    configured,
    status,
    lastSynced,
    error,
    recoveryBackup,
    clearError: () => {
      setError('');
      setRecoveryBackup(undefined);
    },
    authenticate,
    signOut,
    synchronize,
  };
}
