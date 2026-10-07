'use client';

import { LogoMark, RoleIcon } from './Icons';
import { ROLES } from './roles';

export default function AppShell({ user, onLogout, children }) {
  const meta = ROLES[user.role] ?? { label: user.role };
  return (
    <>
      <header className="bar">
        <div className="hazard" aria-hidden="true" />
        <div className="container bar-inner">
          <span className="brand"><LogoMark /> ApparelFlow</span>
          <span className="chip chip-role">
            <RoleIcon role={user.role} size={18} />
            {meta.label}
          </span>
          <span className="spacer" />
          <span className="who-name">{user.fullName || user.email}</span>
          <button className="btn btn-ink" onClick={onLogout}>Sign out</button>
        </div>
      </header>
      <main id="main" className="container">{children}</main>
    </>
  );
}