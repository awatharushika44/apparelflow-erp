// Small inline SVG icons used by the landing page.
// They are decorative, so assistive technology ignores them.

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

export const ChevronIcon = ({ dir = 'right' }) => (
  <svg {...base} width={24} height={24}>
    <path
      d={
        dir === 'left'
          ? 'M15 5l-7 7 7 7'
          : 'M9 5l7 7-7 7'
      }
    />
  </svg>
);

export const LockIcon = ({ open = false }) => (
  <svg {...base}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path
      d={
        open
          ? 'M8 11V7a4 4 0 0 1 7.5-2'
          : 'M8 11V7a4 4 0 0 1 8 0v4'
      }
    />
  </svg>
);

export const AlertIcon = () => (
  <svg {...base} width={18} height={18}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 7v6M12 16.5v.5" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M7 4l13 8-13 8z" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);

export const MarkIcon = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 32 32"
    aria-hidden="true"
    focusable="false"
  >
    <circle
      className="ld-mark-ring"
      cx="16"
      cy="16"
      r="13"
      strokeDasharray="3 3"
    />
    <circle
      className="ld-mark-dot"
      cx="16"
      cy="16"
      r="6"
    />
  </svg>
);