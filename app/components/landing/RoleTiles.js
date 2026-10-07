'use client';

import { useState } from 'react';
import { DEMO_ACCOUNTS } from '../demo';
import { LockIcon } from './LandingIcons';

const ROLE_ART = {
  cutting_supervisor: (
    <svg viewBox="0 0 180 120" aria-hidden="true" focusable="false">
      <path
        className="ld-art-line"
        d="M25 82L55 42L88 78L118 32L155 82"
      />
      <path
        className="ld-art-line"
        d="M42 92H138"
      />
      <circle className="ld-art-dot" cx="55" cy="42" r="5" />
      <circle className="ld-art-dot" cx="118" cy="32" r="5" />
    </svg>
  ),

  cutting_verifier: (
    <svg viewBox="0 0 180 120" aria-hidden="true" focusable="false">
      <rect
        className="ld-art-box"
        x="40"
        y="24"
        width="100"
        height="72"
        rx="8"
      />
      <path
        className="ld-art-line"
        d="M60 47L72 59L94 35"
      />
      <path
        className="ld-art-line"
        d="M60 76H120"
      />
      <path
        className="ld-art-line"
        d="M60 86H102"
      />
    </svg>
  ),

  sewing_supervisor: (
    <svg viewBox="0 0 180 120" aria-hidden="true" focusable="false">
      <path
        className="ld-art-line"
        d="M42 82V48C42 35 53 26 66 26H103C116 26 126 36 126 49V82"
      />
      <path
        className="ld-art-line"
        d="M35 82H135"
      />
      <path
        className="ld-art-line"
        d="M72 26V82"
      />
      <circle className="ld-art-dot" cx="72" cy="47" r="6" />
    </svg>
  ),
};

export default function RoleTiles({ onPick }) {
  const [activeRole, setActiveRole] = useState(null);

  return (
    <section className="ld-roles" aria-labelledby="roles-heading">
      <div className="ld-section-head">
        <p className="ld-kicker">Choose your station</p>
        <h2 id="roles-heading">Three roles. One controlled flow.</h2>
      </div>

      <div className="ld-role-grid">
        {DEMO_ACCOUNTS.map((account) => {
          const active = activeRole === account.role;

          return (
            <button
              key={account.role}
              type="button"
              className="ld-role-tile"
              onClick={() => onPick(account)}
              onMouseEnter={() => setActiveRole(account.role)}
              onMouseLeave={() => setActiveRole(null)}
              onFocus={() => setActiveRole(account.role)}
              onBlur={() => setActiveRole(null)}
              aria-describedby={`${account.role}-description`}
            >
              <div className="ld-role-top">
                <span className="ld-role-index">
                  {String(
                    DEMO_ACCOUNTS.findIndex(
                      (item) => item.role === account.role,
                    ) + 1,
                  ).padStart(2, '0')}
                </span>

                <span className="ld-gate-pill">
                  <LockIcon open={active} />
                  GATE
                </span>
              </div>

              <div className="ld-role-art">
                {ROLE_ART[account.role]}
              </div>

              <div className="ld-role-copy">
                <h3>{account.label}</h3>
                <p id={`${account.role}-description`}>
                  {account.duty}
                </p>
              </div>

              <span className="ld-role-action">
                Sign in →
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}