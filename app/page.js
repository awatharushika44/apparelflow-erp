'use client';

import { useEffect, useState } from 'react';
import './auth.css';
import './landing.css';

import SupervisorScreen from './components/SupervisorScreen';
import VerifierScreen from './components/VerifierScreen';
import SewingScreen from './components/SewingScreen';
import Landing from './components/landing/Landing';
import { RoleIcon } from './components/Gate';
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
      <>
        <header className="bar">
          <div
            className="hazard"
            aria-hidden="true"
          />

          <div className="container bar-inner">
            <span className="brand">
              ApparelFlow
            </span>

            <span className="chip-role">
              <RoleIcon
                role={user.role}
                size={16}
              />

              {LABELS[user.role] ??
                user.role}
            </span>

            <span className="spacer" />

            <span className="who-name">
              {user.fullName ||
                user.email}
            </span>

            <button
              className="btn btn-ink"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </header>

        <main
          id="main"
          className="container"
        >
          <p
            role="status"
            className="sr-only"
          >
            Signed in as{' '}
            {user.fullName ||
              user.email}
            , role{' '}
            {LABELS[user.role] ??
              user.role}.
          </p>

          <div className="page-head">
            <p className="eyebrow">
              {LABELS[user.role] ??
                user.role}
            </p>

            <h1>
              Welcome,{' '}
              {user.fullName ||
                user.email}
            </h1>
          </div>

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
        </main>
      </>
    );
  }

  return (
    <Landing
      busy={busy}
      onLogin={login}
    />
  );
}