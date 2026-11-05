// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../src/components/Settings';
import { emptyData } from '../src/lib/model';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

function settings(onSignOut: () => Promise<void>, onClose = vi.fn()) {
  render(
    createElement(Settings, {
      onClose,
      onSignOut,
      initialConfirmSignOut: true,
      preferences: { mapProvider: 'google', travelMode: 'walking' },
      onPreferences: vi.fn(),
      user: { id: 'account', name: 'Traveller', email: 'traveller@example.test' },
      authenticated: true,
      status: 'synced',
      lastSynced: Date.now(),
      data: emptyData(),
      onImport: vi.fn(),
      onSignIn: vi.fn(),
      onSync: async () => true,
      onInstall: vi.fn(),
      installed: true,
    }),
  );
  return onClose;
}

describe('account sign out', () => {
  it('keeps the account controls open until sign out finishes', async () => {
    let finish!: () => void;
    const onSignOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onClose = settings(onSignOut);
    expect(screen.getAllByRole('heading', { level: 3 })[0].textContent).toBe('Your account');
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' }).at(-1)!);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Stay signed in' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => finish());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the account available and reports a failed sync instead of claiming sign out succeeded', async () => {
    const onClose = settings(async () => {
      throw new Error('Your latest changes have not finished syncing.');
    });
    await act(async () =>
      fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' }).at(-1)!),
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Your latest changes have not finished syncing.',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('traveller@example.test')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Stay signed in' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
