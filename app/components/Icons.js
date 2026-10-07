const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

export const AlertIcon = () => (
  <svg {...base}><circle cx="12" cy="12" r="10" /><path d="M12 7v6M12 16.5v.5" /></svg>
);
export const TickIcon = () => (
  <svg {...base}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);
export const CrossIcon = () => (
  <svg {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>
);

export function LogoMark() {
  return (
    <svg {...base} width={32} height={32} viewBox="0 0 32 32" strokeWidth={4}>
      <path d="M7 28V12" /><path d="M7 15h20" /><circle cx="7" cy="8" r="2" />
    </svg>
  );
}

const ROLE_PATHS = {
  // scissors
  cutting_supervisor: (
    <>
      <circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" />
      <path d="M8 16L19 3M16 16L5 3" />
    </>
  ),
  // clipboard with a tick
  cutting_verifier: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" />
      <path d="M8.5 14l2.5 2.5 4.5-5" />
    </>
  ),
  // thread spool
  sewing_supervisor: (
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

// Traffic light: shape + glyph + word. Colour is only the third cue.
const LIGHTS = {
  GREEN: {
    cls: 'chip-green',
    word: 'MATCH',
    shape: (<><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-7" /></>),
  },
  YELLOW: {
    cls: 'chip-yellow',
    word: 'EXCESS',
    shape: (<><path d="M12 3L22 21H2z" /><path d="M12 12v6M9 15h6" /></>),
  },
  RED: {
    cls: 'chip-red',
    word: 'SHORTAGE',
    shape: (
      <>
        <polygon points="8,2 16,2 22,8 22,16 16,22 8,22 2,16 2,8" />
        <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
      </>
    ),
  },
  UNCOUNTED: {
    cls: 'chip-uncounted',
    word: 'NOT COUNTED',
    shape: <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />,
  },
};

export function TrafficChip({ light, count }) {
  const key = LIGHTS[light] ? light : 'UNCOUNTED';
  const cfg = LIGHTS[key];
  return (
    <span className={`chip ${cfg.cls}`}>
      <svg {...base}>{cfg.shape}</svg>
      <span className="sr-only">{key}: </span>
      <span>{cfg.word}</span>
      {count != null ? <span className="chip-count num">{count}</span> : null}
    </span>
  );
}

// The barrier gate. Only one instance per page (the pattern id is fixed).
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