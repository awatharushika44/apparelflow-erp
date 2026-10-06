'use client';

import { useEffect, useState } from 'react';
import './auth.css';

// Demo accounts from db/demo-data.mjs. Public by design (the PDF requires them in the README).
const DEMO_ACCOUNTS = [
  {
    role: 'Cutting Supervisor',
    blurb: 'Creates cutting orders',
    email: 'supervisor@apparelflow.demo',
    password: 'Cutting@2026',
  },
  {
    role: 'Cutting Verifier',
    blurb: 'Counts pieces, approves or rejects',
    email: 'verifier@apparelflow.demo',
    password: 'Verify@2026',
  },
  {
    role: 'Sewing Supervisor',
    blurb: 'Starts assembly on verified batches',
    email: 'sewing@apparelflow.demo',
    password: 'Sewing@2026',
  },
];

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty body
  }
  return { ok: res.ok, status: res.status, data };
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});

  // The session lives in the httpOnly cookie, so a reload asks the server who we are.
  async function loadMe() {
    const res = await api('/api/auth/me');
    setUser(res.ok ? (res.data?.user ?? res.data) : null);
    setChecking(false);
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function login(creds) {
    setBusy(true);
    setErrors({});
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(creds),
    });
    setBusy(false);
    if (!res.ok) {
      setErrors({ form: res.data?.error?.message || 'Sign-in failed.' });
      return;
    }
    await loadMe();
  }

  function onSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!email.trim()) next.email = 'Email is required.';
    if (!password) next.password = 'Password is required.';
    setErrors(next);
    if (Object.keys(next).length === 0) {
      login({ email: email.trim(), password });
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    setUser(null);
    setEmail('');
    setPassword('');
  }

  if (checking) {
    return (
      <main className="shell">
        <p>Checking your session...</p>
      </main>
    );
  }

  if (user) {
    return (
      <main className="shell">
        <h1>ApparelFlow ERP</h1>
        <div className="who" role="status">
          Signed in as <strong>{user.fullName || user.full_name || user.email}</strong>, role{' '}
          <strong>{user.role}</strong>.
        </div>
        <button className="btn" onClick={logout}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main className="shell">
      <h1>ApparelFlow ERP: Cutting Gatekeeper</h1>
      <p className="lead">Pick a role to sign in with one click, or use the form below.</p>

      <section aria-label="Role Switcher" className="badges">
        {DEMO_ACCOUNTS.map((a) => (
          <button
            key={a.role}
            className="badge"
            disabled={busy}
            onClick={() => login({ email: a.email, password: a.password })}
          >
            <strong>{a.role}</strong>
            <span>{a.blurb}</span>
          </button>
        ))}
      </section>

      <form className="card" onSubmit={onSubmit} noValidate>
        <h2>Sign in</h2>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby="email-err"
          />
          <span id="email-err" className="err">
            {errors.email}
          </span>
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby="pw-err"
          />
          <span id="pw-err" className="err">
            {errors.password}
          </span>
        </div>

        <p className="err" role="alert">
          {errors.form}
        </p>

        <button className="btn" type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
    </main>
  );
}