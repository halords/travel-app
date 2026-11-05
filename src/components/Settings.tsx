import { useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Car,
  Check,
  Cloud,
  Download,
  Footprints,
  LoaderCircle,
  LogOut,
  Navigation,
  TrainFront,
} from 'lucide-react';
import { today, type AppData, type Preferences, type User } from '../lib/model';
import type { SyncStatus } from '../hooks/useWorkspace';
import { Modal } from './Modal';

export const travelModes = [
  { value: 'walking', label: 'Walking', Icon: Footprints },
  { value: 'driving', label: 'Driving', Icon: Car },
  { value: 'transit', label: 'Transit', Icon: TrainFront },
] as const;
export function TravelModes({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
}) {
  return (
    <div className="travel-modes" aria-label="Preferred travel mode">
      {travelModes.map(({ value, label, Icon }) => (
        <button
          type="button"
          key={value}
          className={preferences.travelMode === value ? 'active' : ''}
          aria-pressed={preferences.travelMode === value}
          onClick={() => onChange({ ...preferences, travelMode: value })}
        >
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function exportBackup(data: AppData) {
  exportRawBackup(JSON.stringify(data, null, 2));
}

export function exportRawBackup(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `roam-backup-${today()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Settings({
  onClose,
  preferences,
  onPreferences,
  user,
  authenticated,
  status,
  lastSynced,
  data,
  onImport,
  onSignIn,
  onSignOut,
  onSync,
  onInstall,
  installed,
  initialConfirmSignOut = false,
}: {
  onClose: () => void;
  preferences: Preferences;
  onPreferences: (preferences: Preferences) => void;
  user: User | null;
  authenticated: boolean;
  status: SyncStatus;
  lastSynced: number | null;
  data: AppData;
  onImport: (raw: unknown) => void;
  onSignIn: () => void;
  onSignOut: () => Promise<void>;
  onSync: () => Promise<boolean>;
  onInstall: () => void;
  installed: boolean;
  initialConfirmSignOut?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(initialConfirmSignOut);
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a Roam backup smaller than 2 MB.');
      onImport(JSON.parse(await file.text()));
      setMessage('Your backup was restored. Existing trips were kept.');
    } catch (failure) {
      setMessage(
        failure instanceof Error && failure.message.startsWith('Choose')
          ? failure.message
          : 'This isn’t a valid Roam backup. Your existing trips have not changed.',
      );
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const logout = async () => {
    setBusy(true);
    setMessage('');
    try {
      await onSignOut();
      onClose();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Please try signing out again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Make yourself at home"
      subtitle="A few things to make travelling easier."
      onClose={busy ? () => {} : onClose}
    >
      <div className="form-content settings-content">
        <section className="settings-section account-settings">
          <h3>
            <Cloud size={18} />
            Your account
          </h3>
          {user ? (
            <>
              <div className="account-detail">
                <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </div>
              </div>
              <p>
                {!authenticated
                  ? 'Sign in again to sync. Your saved trips are still here.'
                  : status === 'synced' && lastSynced
                    ? `Last synced at ${new Date(lastSynced).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
                    : status === 'syncing'
                      ? 'Syncing your latest plans…'
                      : 'Your plans are saved on this device. Sync to keep your other devices up to date.'}
              </p>
              <div className="settings-actions">
                {authenticated ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || status === 'syncing'}
                    onClick={async () => {
                      setBusy(true);
                      const ok = await onSync();
                      setMessage(
                        ok
                          ? 'Everything is up to date.'
                          : 'Couldn’t sync just yet. Your plans are saved on this device.',
                      );
                      setBusy(false);
                    }}
                  >
                    <Cloud size={16} />
                    Sync now
                  </button>
                ) : (
                  <button type="button" className="button primary" onClick={onSignIn}>
                    Sign in
                  </button>
                )}
                <button
                  type="button"
                  className="button signout-button"
                  disabled={busy}
                  onClick={() => setConfirmSignOut(true)}
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
              {confirmSignOut && (
                <div className="notice">
                  <p>
                    Signing out removes this account’s downloaded trips from this device. Your
                    synced trips stay in your account.
                  </p>
                  <div className="settings-actions">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setConfirmSignOut(false)}
                      disabled={busy}
                    >
                      Stay signed in
                    </button>
                    <button
                      type="button"
                      className="button danger-button"
                      onClick={() => void logout()}
                      disabled={busy}
                    >
                      {busy ? <LoaderCircle size={16} className="spin" /> : 'Sign out'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p>Keep your plans in sync between your phone, tablet, and computer.</p>
              <button type="button" className="button primary" onClick={onSignIn}>
                Sign in or create an account
              </button>
            </>
          )}
        </section>
        <section className="settings-section maps-settings">
          <h3>
            <Navigation size={18} />
            Your maps app
          </h3>
          <p>Tap a place and we’ll open directions here.</p>
          <div className="provider-options">
            {(['google', 'apple'] as const).map((provider) => (
              <button
                type="button"
                key={provider}
                aria-pressed={preferences.mapProvider === provider}
                className={preferences.mapProvider === provider ? 'selected' : ''}
                onClick={() => onPreferences({ ...preferences, mapProvider: provider })}
              >
                <span className={`provider-symbol ${provider}`}>
                  {provider === 'google' ? 'G' : <Navigation size={19} />}
                </span>
                {provider === 'google' ? 'Google Maps' : 'Apple Maps'}
                {preferences.mapProvider === provider && <Check size={16} />}
              </button>
            ))}
          </div>
          <h4>How do you like to get around?</h4>
          <TravelModes preferences={preferences} onChange={onPreferences} />
        </section>
        <section className="settings-section">
          <h3>
            <ArrowDownToLine size={18} />A copy, just in case
          </h3>
          <p>
            Download all your trips, or bring back a Roam backup. Restoring merges your backup with
            your current plans.
          </p>
          <div className="settings-actions">
            <button type="button" className="button secondary" onClick={() => exportBackup(data)}>
              <ArrowDownToLine size={16} />
              Export backup
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => fileInput.current?.click()}
            >
              <ArrowUpFromLine size={16} />
              Restore backup
            </button>
            <input
              type="file"
              ref={fileInput}
              hidden
              accept="application/json,.json"
              onChange={(e) => void importFile(e.target.files?.[0])}
              aria-label="Restore a Roam backup"
            />
          </div>
        </section>
        {!installed && (
          <section className="settings-section install-setting">
            <div>
              <h3>
                <Download size={18} />
                Take Roam with you
              </h3>
              <p>Add it to your home screen for quick access.</p>
            </div>
            <button type="button" className="button secondary" onClick={onInstall}>
              Install
            </button>
          </section>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        <p className="settings-footnote">Roam · A little plan, a great trip.</p>
      </div>
    </Modal>
  );
}
