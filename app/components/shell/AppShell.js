'use client';

// Signed-in frame: calm static scene, a top bar of solid pills, and one paper panel for the screen.
import '../../landing.css';
import '../../shell.css';
import Scenes from '../landing/Scenes';
import { MarkIcon } from '../landing/LandingIcons';
import { RoleIcon } from '../Gate';

export default function AppShell({ user, roleLabel, onLogout, children }) {
  const name = user.fullName || user.email;

  return (
    <div className="ld-root">
      <Scenes index={0} />

      <header className="sh-bar">
        <div className="sh-brand">
          <MarkIcon />
          <span className="sh-brand-name">ApparelFlow</span>
          <span className="sh-tag">CUTTING GATE</span>
        </div>

        <span className="sh-role">
          <RoleIcon role={user.role} size={18} />
          {roleLabel}
        </span>

        <span className="sh-spacer" />

        <span className="sh-user">{name}</span>

        <button
          type="button"
          className="sh-out"
          onClick={onLogout}
        >
          Sign out
        </button>
      </header>

      <main id="main" className="sh-main">
        <p role="status" className="sr-only">
          Signed in as {name}, role {roleLabel}.
        </p>

        <div className="sh-panel">
          <div className="sh-head">
            <p className="eyebrow">{roleLabel}</p>
            <h1>Welcome, {name}</h1>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}