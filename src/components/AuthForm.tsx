import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import type { AuthInput } from '../lib/api';
import { Modal } from './Modal';

export function AuthForm({
  onClose,
  onSubmit,
  configured,
  defaultEmail = '',
}: {
  onClose: () => void;
  onSubmit: (input: AuthInput) => Promise<void>;
  configured: boolean | null;
  defaultEmail?: string;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        action: mode,
        email: email.trim(),
        password,
        ...(mode === 'signup' ? { name: name.trim() } : {}),
      });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'We couldn’t sign you in. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={mode === 'login' ? 'Welcome back.' : 'A home for your adventures.'}
      subtitle="Your plans, ready on every device."
      onClose={busy ? () => {} : onClose}
    >
      <form onSubmit={submit} className="form-content auth-form">
        <div className="segmented">
          <button
            type="button"
            aria-pressed={mode === 'login'}
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === 'signup'}
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => {
              setMode('signup');
              setError('');
            }}
          >
            Create account
          </button>
        </div>
        {configured === false && (
          <p className="notice">
            Cloud sync is being connected. Your trips are safely saved on this device in the
            meantime.
          </p>
        )}
        {mode === 'signup' && (
          <label className="field">
            Your name
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
              maxLength={60}
              required
            />
          </label>
        )}
        <label className="field">
          Email
          <div className="input-icon">
            <Mail size={17} />
            <input
              autoFocus={mode === 'login'}
              autoComplete="email"
              inputMode="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={254}
              required
            />
          </div>
        </label>
        <label className="field">
          Password
          <div className="input-icon password-input">
            <LockKeyhole size={17} />
            <input
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === 'signup' ? 10 : 1}
              maxLength={128}
              placeholder={mode === 'signup' ? 'At least 10 characters' : 'Your password'}
              required
            />
            <button
              type="button"
              className="icon-button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        {mode === 'signup' && (
          <p className="field-hint">
            Use a strong, unique password. Save it in your password manager for your next trip.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || configured === false}
          className="button primary full-width"
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <>
              {mode === 'login' ? 'Sign in' : 'Create my account'}
              <ArrowRight size={18} />
            </>
          )}
        </button>
        <p className="auth-note">
          <LockKeyhole size={14} />
          Your trips are private to your account.
        </p>
        <p className="auth-local-note">Trips you’ve made on this device will come with you.</p>
      </form>
    </Modal>
  );
}
