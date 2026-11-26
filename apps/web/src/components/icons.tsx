import type { ReactNode, SVGProps } from "react";

/**
 * Inline 16px icons drawn for 4x35 from the shapes in docs/design/README.md (no icon font, no
 * third-party set). 1.5px stroke in currentColor. Every icon is decorative: the text label next to
 * it carries the meaning, so each one is `aria-hidden`.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

// ---- Status -------------------------------------------------------------------------------------

/** pass: a check mark inside a full circle. */
export const IconPass = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M5 8.2l2.2 2.2L11 6" />
  </Svg>
);

/** fail: a cross inside a flat-topped octagon (stop sign outline). */
export const IconFail = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.3 1.5h5.4l3.8 3.8v5.4l-3.8 3.8H5.3l-3.8-3.8V5.3z" />
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
  </Svg>
);

/** warning: a rounded triangle, point up, with an exclamation mark. */
export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.1 2.4a1 1 0 0 1 1.8 0l5.6 10.1a1 1 0 0 1-.9 1.5H2.4a1 1 0 0 1-.9-1.5z" />
    <path d="M8 6.2v3.3" />
    <circle cx="8" cy="11.6" r="0.5" fill="currentColor" stroke="none" />
  </Svg>
);

/** review: a flag on a pole. */
export const IconReview = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 2v12" />
    <path d="M4 3h8l-2 2.5L12 8H4" />
  </Svg>
);

/** approved: a shield (flat top, pointed bottom) with a check mark inside. */
export const IconApproved = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.8 2.2h10.4v5.2c0 3-2.3 5.2-5.2 6.4-2.9-1.2-5.2-3.4-5.2-6.4z" />
    <path d="M5.4 7.6l1.8 1.8 3.4-3.4" />
  </Svg>
);

/** empty: a dashed circle outline with nothing inside. */
export const IconEmpty = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" strokeDasharray="2 1.6" />
  </Svg>
);

/** running: two curved arrows chasing each other around a circle. */
export const IconRunning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 8a5.5 5.5 0 0 1-9.9 3.3" />
    <path d="M2.5 8a5.5 5.5 0 0 1 9.9-3.3" />
    <path d="M12.6 2.2v2.6H10M3.4 13.8v-2.6H6" />
  </Svg>
);

// ---- Provenance ---------------------------------------------------------------------------------

/** span: a pair of square brackets. */
export const IconSpan = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 2.5h-2v11h2M10.5 2.5h2v11h-2" />
  </Svg>
);

/** transform: a right arrow passing through a small square. */
export const IconTransform = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="5" height="5" rx="0.6" />
    <path d="M1.5 8h13M12 5.5L14.5 8 12 10.5" />
  </Svg>
);

/** dataset: a database cylinder. */
export const IconDataset = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="8" cy="3.5" rx="5" ry="1.8" />
    <path d="M3 3.5v9c0 1 2.2 1.8 5 1.8s5-.8 5-1.8v-9" />
    <path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" />
  </Svg>
);

/** inferred: a dot with a dashed line leading to a hollow dot. */
export const IconInferred = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="3" cy="12.5" r="1.5" fill="currentColor" />
    <path d="M4.5 11l5.5-5.5" strokeDasharray="1.6 1.6" />
    <circle cx="12" cy="4" r="2.2" />
  </Svg>
);

/** human: a person, circle head over rounded shoulders. */
export const IconHuman = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="5" r="2.7" />
    <path d="M2.8 14c.4-2.8 2.6-4.6 5.2-4.6s4.8 1.8 5.2 4.6" />
  </Svg>
);

/** external: a square with an arrow leaving its top-right corner. */
export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 9.5v3.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5" />
    <path d="M9 2h5v5M14 2L7.5 8.5" />
  </Svg>
);

// ---- UI -----------------------------------------------------------------------------------------

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6l4 4 4-4" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7.2v4" />
    <circle cx="8" cy="4.9" r="0.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </Svg>
);

export const IconSortAsc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 13V3M4.5 6.5L8 3l3.5 3.5" />
  </Svg>
);

export const IconSortDesc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M4.5 9.5L8 13l3.5-3.5" />
  </Svg>
);

export const IconSortNone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />
  </Svg>
);
