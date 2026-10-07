'use client';

import { useEffect, useRef, useState } from 'react';
import { DEMO_ACCOUNTS } from '../demo';
import { AlertIcon, CloseIcon, LockIcon } from './LandingIcons';

export default function AuthDialog({
  open,
  mode = 'signin',
  account = null,
  busy = false,
  onClose,
  onLogin,
}) {
  const dialogRef = useRef(null);
  const [activeMode, setActiveMode] = useState(mode);
  const [email, setEmail] = useState(account?.email ?? '');
  const [password, setPassword] = useState(account?.password ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;

    setActiveMode(mode);
    setEmail(account?.email ?? '');
    setPassword(account?.password ?? '');
    setErrors({});

    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [open, mode, account]);

  function closeDialog() {
    const dialog = dialogRef.current;

    if (dialog?.open) {
      dialog.close();
    }

    onClose?.();
  }

  function validate() {
    const next = {};

    if (!email.trim()) {
      next.email = 'Email is required.';
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }

    if (!password) {
      next.password = 'Password is required.';
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();

    if (!validate()) return;

    const result = await onLogin?.({
      email: email.trim(),
      password,
    });

    if (!result?.ok && result?.message) {
      setErrors({
        form: result.message,
      });
    }
  }

  function chooseDemo(demo) {
    setEmail(demo.email);
    setPassword(demo.password);
    setActiveMode('signin');
    setErrors({});
  }

  return (
    <dialog
      ref={dialogRef}
      className="ld-dialog"
      aria-labelledby="auth-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClose={onClose}
    >
      <div className="ld-dialog-shell">
        <button
          type="button"
          className="ld-dialog-close"
          aria-label="Close sign-in dialog"
          onClick={closeDialog}
        >
          <CloseIcon />
        </button>

        <div className="ld-dialog-mark">
          <LockIcon open={activeMode === 'signin'} />
        </div>

        <p className="ld-kicker">ApparelFlow access</p>

        <h2 id="auth-dialog-title">
          {activeMode === 'signin'
            ? 'Enter the cutting gate.'
            : 'Request factory access.'}
        </h2>

        <div
          className="ld-auth-tabs"
          role="tablist"
          aria-label="Authentication"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'signin'}
            className={activeMode === 'signin' ? 'is-active' : ''}
            onClick={() => {
              setActiveMode('signin');
              setErrors({});
            }}
          >
            Sign in
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'signup'}
            className={activeMode === 'signup' ? 'is-active' : ''}
            onClick={() => {
              setActiveMode('signup');
              setErrors({});
            }}
          >
            Create an account
          </button>
        </div>

        {activeMode === 'signup' ? (
          <div className="ld-signup-note">
            <AlertIcon />

            <div>
              <h3>Factory accounts are issued by an admin.</h3>
              <p>
                This assessment does not expose public registration.
                Use one of the demo accounts below to explore each role.
              </p>
            </div>
          </div>
        ) : null}

        {activeMode === 'signin' ? (
          <form onSubmit={submit} noValidate>
            {errors.form ? (
              <div className="ld-form-error" role="alert">
                <AlertIcon />
                <span>{errors.form}</span>
              </div>
            ) : null}

            <div className="ld-field">
              <label htmlFor="landing-email">Email</label>

              <input
                id="landing-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? 'landing-email-error' : undefined
                }
              />

              {errors.email ? (
                <p id="landing-email-error" className="ld-field-error">
                  {errors.email}
                </p>
              ) : null}
            </div>

            <div className="ld-field">
              <label htmlFor="landing-password">Password</label>

              <div className="ld-password-wrap">
                <input
                  id="landing-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? 'landing-password-error' : undefined
                  }
                />

                <button
                  type="button"
                  className="ld-show-password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {errors.password ? (
                <p id="landing-password-error" className="ld-field-error">
                  {errors.password}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              className="ld-submit"
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? 'Opening gate…' : 'Sign in'}
            </button>
          </form>
        ) : null}

        <div className="ld-demo">
          <div className="ld-demo-heading">
            <span>Demo access</span>
            <span>3 roles</span>
          </div>

          <div className="ld-demo-list">
            {DEMO_ACCOUNTS.map((demo) => (
              <button
                key={demo.role}
                type="button"
                className="ld-demo-row"
                onClick={() => chooseDemo(demo)}
              >
                <span>
                  <strong>{demo.label}</strong>
                  <small>{demo.email}</small>
                </span>

                <span>Use →</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </dialog>
  );
}