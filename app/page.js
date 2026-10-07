'use client';

import { useEffect, useState } from 'react';
import './auth.css';
import SupervisorScreen from './components/SupervisorScreen';
import { GateIllustration, RoleIcon } from './components/Gate';

// Public demo accounts from db/demo-data.mjs (the PDF requires them in the README).
const DEMO_ACCOUNTS = [
  { role: 'cutting_supervisor', label: 'Cutting Supervisor', blurb: 'Creates cutting orders and sends them to QC.', email: 'supervisor@apparelflow.demo', password: 'Cutting@2026' },
  { role: 'cutting_verifier', label: 'Cutting Verifier', blurb: 'Counts every piece, then approves or rejects.', email: 'verifier@apparelflow.demo', password: 'Verify@2026' },
  { role: 'sewing_supervisor', label: 'Sewing Supervisor', blurb: 'Sees verified batches only and starts assembly.', email: 'sewing@apparelflow.demo', password: 'Sewing@2026' },
];
const LABELS = Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.role, a.label]));

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json' } });
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

  // One path for the badges AND the form: both call the real login API.
  async function login(creds) {
    setBusy(true);
    setErrors({});
    const res = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(creds) });
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
    if (Object.keys(next).length === 0) login({ email: email.trim(), password });
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    setUser(null);
    setEmail('');
    setPassword('');
  }

  if (checking) {
    return (
      <main id="main" className="container">
        <p className="page-head">Checking your session...</p>
      </main>
    );
  }

  if (user) {
    return (
      <>
        <header className="bar">
          <div className="hazard" aria-hidden="true" />
          <div className="container bar-inner">
            <span className="brand">ApparelFlow</span>
            <span className="chip-role">
              <RoleIcon role={user.role} size={16} />
              {LABELS[user.role] ?? user.role}
            </span>
            <span className="spacer" />
            <span className="who-name">{user.fullName || user.email}</span>
            <button className="btn btn-ink" onClick={logout}>Sign out</button>
          </div>
        </header>

        <main id="main" className="container">
          <p role="status" className="sr-only">
            Signed in as {user.fullName || user.email}, role {LABELS[user.role] ?? user.role}.
          </p>
          <div className="page-head">
            <p className="eyebrow">{LABELS[user.role] ?? user.role}</p>
            <h1>Welcome, {user.fullName || user.email}</h1>
          </div>

          {/* The UI only shows what the role may use. The server enforces it anyway. */}
          {user.role === 'cutting_supervisor' && <SupervisorScreen />}
          {user.role !== 'cutting_supervisor' && (
            <p className="lead">This role's screen is built in a later step.</p>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <div className="hazard" aria-hidden="true" />
      <main id="main" className="container">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow rise" style={{ '--i': 0 }}>ApparelFlow ERP · Cutting Gatekeeper</p>
            <h1 id="hero-title" className="hero-title rise" style={{ '--i': 1 }}>
              Nothing reaches sewing until it is <em>counted and signed.</em>
            </h1>
            <p className="lead rise" style={{ '--i': 2 }}>
              A second person counts every piece, and the server refuses any batch that is short.
            </p>
          </div>
          <div className="hero-panel rise" style={{ '--i': 2 }}>
            <div className="gate-stage"><GateIllustration open={busy} /></div>
            <p className="gate-caption" aria-live="polite">
              {busy ? 'Gate open. Signing you in...' : 'Gate closed. Sign in to open it.'}
            </p>
          </div>
        </section>

        <section className="page-head" aria-labelledby="badges-title">
          <p className="eyebrow">Role Switcher</p>
          <h2 id="badges-title">Pick a badge to sign in</h2>
          <p className="lead">One click uses the real login. Each badge opens a different set of doors.</p>
        </section>

        <ul className="badges plain">
          {DEMO_ACCOUNTS.map((a, i) => (
            <li key={a.role} className="badge rise" style={{ '--i': i + 3 }}>
              <span className="badge-plate" aria-hidden="true">
                <span className="badge-slot" />
                <span className="badge-stripe" />
              </span>
              <div className="badge-body">
                <span className="badge-icon"><RoleIcon role={a.role} size={30} /></span>
                <h3>{a.label}</h3>
                <p className="hint">{a.email}</p>
                <p>{a.blurb}</p>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => login({ email: a.email, password: a.password })}
                >
                  Sign in as {a.label}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <section className="page-head" aria-labelledby="signin-title">
          <h2 id="signin-title">Or type your credentials</h2>
        </section>
        <form className="card form-card" onSubmit={onSubmit} noValidate>
          <div className="field">
            <div className="field-box">
              <label htmlFor="email">Email</label>
              <input id="email" className="control" type="email" autoComplete="username"
                placeholder="you@apparelflow.demo" value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(errors.email)} aria-describedby="email-err" />
            </div>
            <p id="email-err" className="field-error" aria-live="polite">{errors.email}</p>
          </div>

          <div className="field">
            <div className="field-box">
              <label htmlFor="password">Password</label>
              <input id="password" className="control" type="password" autoComplete="current-password"
                placeholder="Your password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(errors.password)} aria-describedby="password-err" />
            </div>
            <p id="password-err" className="field-error" aria-live="polite">{errors.password}</p>
          </div>

          {errors.form && <p className="alert" role="alert">{errors.form}</p>}

          <button className="btn btn-primary" type="submit" disabled={busy}>Sign in</button>
        </form>
      </main>
    </>
  );
}