'use client';

import { useEffect, useState } from 'react';
import './auth.css';

import SupervisorScreen from './components/SupervisorScreen';
import VerifierScreen from './components/VerifierScreen';
import SewingScreen from './components/SewingScreen';
import AppShell from './components/shell/AppShell';
import Landing from './components/landing/Landing';
import { DEMO_ACCOUNTS } from './components/demo';

const LABELS = Object.fromEntries(
  DEMO_ACCOUNTS.map((account) => [
    account.role,
    account.label,
  ]),
);

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let data = null;

  try {
    data = await res.json();
  } catch {
    // Some endpoints may return an empty body.
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadMe() {
    const res = await api('/api/auth/me');

    setUser(
      res.ok
        ? res.data?.user ?? res.data
        : null,
    );

    setChecking(false);
  }

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount: state is set only after the request starts
    loadMe();
  }, []);

  async function login(credentials) {
    setBusy(true);

    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    setBusy(false);

    if (!res.ok) {
      return {
        ok: false,
        message:
          res.data?.error?.message ||
          'Sign-in failed.',
      };
    }

    await loadMe();

    return { ok: true };
  }

  async function logout() {
    await api('/api/auth/logout', {
      method: 'POST',
      body: '{}',
    });

    setUser(null);
  }

  if (checking) {
    return (
      <main id="main" className="container">
        <p className="page-head">
          Checking your session...
        </p>
      </main>
    );
  }

  if (user) {
    return (
      <AppShell
        user={user}
        roleLabel={
          LABELS[user.role] ?? user.role
        }
        onLogout={logout}
      >
        {user.role ===
          'cutting_supervisor' && (
          <SupervisorScreen />
        )}

        {user.role ===
          'cutting_verifier' && (
          <VerifierScreen />
        )}

        {user.role ===
          'sewing_supervisor' && (
          <SewingScreen />
        )}
      </AppShell>
    );
  }

  return (
    <Landing
      busy={busy}
      onLogin={login}
    />
  );
}