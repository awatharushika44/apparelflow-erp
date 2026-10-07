const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

const ROLE_PATHS = {
  cutting_supervisor: ( // scissors
    <>
      <circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" />
      <path d="M8 16L19 3M16 16L5 3" />
    </>
  ),
  cutting_verifier: ( // clipboard with a tick
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" />
      <path d="M8.5 14l2.5 2.5 4.5-5" />
    </>
  ),
  sewing_supervisor: ( // thread spool
    <>
      <path d="M7 4h10M7 20h10" /><rect x="8" y="6" width="8" height="12" rx="1" />
      <path d="M8 9l8 2M8 12l8 2M8 15l8 2" />
    </>
  ),
};

export function RoleIcon({ role, size = 24 }) {
  return (
    <svg {...base} width={size} height={size}>
      {ROLE_PATHS[role] ?? ROLE_PATHS.cutting_supervisor}
    </svg>
  );
}

// Barrier gate. One per page (the pattern id is fixed).
export function GateIllustration({ open }) {
  return (
    <svg
      className={`gate-svg${open ? ' gate-open' : ''}`}
      viewBox="0 0 360 240"
      role="img"
      aria-label={open ? 'Barrier gate with the arm raised' : 'Barrier gate with the arm lowered'}
    >
      <defs>
        <pattern id="gate-hazard" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect className="hz-a" width="14" height="28" />
          <rect className="hz-b" x="14" width="14" height="28" />
        </pattern>
      </defs>
      <rect className="gate-ground" x="0" y="212" width="360" height="6" rx="3" />
      <g className="gate-arm">
        <rect x="84" y="102" width="250" height="16" rx="8" fill="url(#gate-hazard)" />
        <rect className="gate-arm-outline" x="84" y="102" width="250" height="16" rx="8" />
      </g>
      <rect className="gate-post" x="40" y="80" width="56" height="132" rx="8" />
      <circle className="gate-lamp" cx="68" cy="66" r="14" />
      <circle className="gate-pivot" cx="84" cy="110" r="10" />
    </svg>
  );
}